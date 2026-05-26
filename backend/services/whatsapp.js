const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateAutoReply } = require('./ai');

const QR_PATH = path.join(__dirname, '../data/qr.png');

// DEMO_MODE=true simulates WhatsApp — AI generates messages but nothing is actually sent
const DEMO_MODE = process.env.DEMO_MODE === 'true';

let client = null;
let io = null;
let isReady = DEMO_MODE; // in demo mode we're always "ready"
let currentQR = null;

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

async function initialize() {
  if (DEMO_MODE) {
    updateStatus('connected');
    emit('whatsapp:status', { status: 'connected', demo: true });
    console.log('[WhatsApp] DEMO MODE — messages simulated, AI is live');
    return;
  }

  const SESSION_DIR = path.join(__dirname, '../data/whatsapp-session');

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list',
      ],
    },
  });

  client.on('qr', async (qr) => {
    try {
      currentQR = await qrcode.toDataURL(qr);
      // Save as PNG file so it can be displayed externally
      await qrcode.toFile(QR_PATH, qr, { width: 300, margin: 2 });
      updateStatus('qr_ready');
      emit('whatsapp:qr', { qr: currentQR });
      console.log('[WhatsApp] QR code saved to:', QR_PATH);
      console.log('[WhatsApp] Scan the QR with your WhatsApp phone app');
    } catch (err) {
      console.error('[WhatsApp] QR generation error:', err.message);
    }
  });

  client.on('authenticated', () => {
    currentQR = null;
    updateStatus('authenticated');
    emit('whatsapp:status', { status: 'authenticated' });
    console.log('[WhatsApp] Authenticated successfully');
  });

  client.on('ready', () => {
    isReady = true;
    currentQR = null;
    updateStatus('connected');
    emit('whatsapp:status', { status: 'connected' });
    console.log('[WhatsApp] Client is ready!');
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    updateStatus('disconnected');
    emit('whatsapp:status', { status: 'disconnected', reason });
    console.log('[WhatsApp] Disconnected:', reason);
  });

  client.on('message', handleIncomingMessage);

  client.on('message_ack', (msg, ack) => {
    // ack: 1=sent, 2=delivered, 3=read
    const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read' };
    if (statusMap[ack]) {
      db.prepare('UPDATE messages SET status = ? WHERE whatsapp_id = ?').run(
        statusMap[ack],
        msg.id._serialized
      );
      emit('message:ack', { whatsapp_id: msg.id._serialized, status: statusMap[ack] });
    }
  });

  try {
    await client.initialize();
  } catch (err) {
    console.error('[WhatsApp] Initialization error:', err.message);
    updateStatus('error');
  }
}

async function handleIncomingMessage(message) {
  if (message.isGroupMsg) return;
  if (message.from === 'status@broadcast') return;

  const phone = message.from.replace('@c.us', '');
  console.log(`[WhatsApp] Incoming from ${phone}: ${message.body.substring(0, 50)}`);

  const business = db
    .prepare('SELECT * FROM businesses WHERE phone = ?')
    .get(phone);

  if (!business) {
    console.log(`[WhatsApp] Unknown number: ${phone}`);
    return;
  }

  let conversation = db
    .prepare('SELECT * FROM conversations WHERE business_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(business.id);

  if (!conversation) {
    const convId = uuidv4();
    db.prepare(
      'INSERT INTO conversations (id, business_id, whatsapp_chat_id) VALUES (?, ?, ?)'
    ).run(convId, business.id, message.from);
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  } else {
    db.prepare('UPDATE conversations SET updated_at = unixepoch() WHERE id = ?').run(
      conversation.id
    );
  }

  const msgId = uuidv4();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, direction, content, whatsapp_id, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(msgId, conversation.id, 'inbound', message.body, message.id._serialized, 'received');

  const totalResponses =
    parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_responses'").get()?.value || '0') + 1;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'total_responses'").run(
    String(totalResponses)
  );

  db.prepare("UPDATE businesses SET status = 'responded' WHERE id = ?").run(business.id);

  const newMessage = {
    id: msgId,
    conversation_id: conversation.id,
    direction: 'inbound',
    content: message.body,
    timestamp: Math.floor(Date.now() / 1000),
    status: 'received',
    business,
  };

  emit('message:new', newMessage);

  const autoReply = db
    .prepare("SELECT value FROM settings WHERE key = 'auto_reply'")
    .get();
  if (autoReply?.value !== 'true') return;

  const delaySeconds = parseInt(process.env.REPLY_DELAY_SECONDS || '5');
  setTimeout(async () => {
    try {
      const history = db
        .prepare(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
        )
        .all(conversation.id);

      const { message: replyText, model } = await generateAutoReply(
        business,
        history,
        message.body
      );

      await sendMessage(phone, replyText, conversation.id, model);
    } catch (err) {
      console.error('[WhatsApp] Auto-reply error:', err.message);
    }
  }, delaySeconds * 1000);
}

async function sendMessage(phone, text, conversationId, aiModel = null) {
  if (!isReady) {
    throw new Error('WhatsApp client not ready');
  }

  const msgId = uuidv4();
  let whatsappMsgId = `demo_${msgId}`;

  if (!DEMO_MODE) {
    if (!client) throw new Error('WhatsApp client not initialized');
    const chatId = `${phone}@c.us`;
    try {
      const sentMsg = await client.sendMessage(chatId, text);
      whatsappMsgId = sentMsg.id._serialized;
    } catch (err) {
      console.error('[WhatsApp] Send error:', err.message);
      throw err;
    }
  } else {
    console.log(`[DEMO] → ${phone}: ${text.substring(0, 60)}...`);
    // Simulate a reply after 10s in demo mode for the first contact
    simulateDemoReply(phone, conversationId, text);
  }

  db.prepare(
    'INSERT INTO messages (id, conversation_id, direction, content, ai_model, whatsapp_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(msgId, conversationId, 'outbound', text, aiModel, whatsappMsgId, 'sent');

  const totalSent =
    parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_sent'").get()?.value || '0') + 1;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'total_sent'").run(String(totalSent));

  const message = {
    id: msgId,
    conversation_id: conversationId,
    direction: 'outbound',
    content: text,
    ai_model: aiModel,
    timestamp: Math.floor(Date.now() / 1000),
    status: 'sent',
  };

  emit('message:sent', message);
  return message;
}

// Simulate an incoming reply in demo mode (20% of messages get a response)
function simulateDemoReply(phone, conversationId, originalText) {
  if (Math.random() > 0.20) return;

  const DEMO_REPLIES = [
    'שלום! אני מעוניין לשמוע עוד פרטים',
    'כמה זה עולה בערך?',
    'מה הניסיון שלכם עם עסקים בתחום שלנו?',
    'נשמע מעניין. מתי אפשר לדבר?',
    'יש לכם דוגמאות לעבודות קודמות?',
  ];
  const reply = DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)];

  setTimeout(async () => {
    try {
      const business = db
        .prepare(`SELECT b.* FROM businesses b
           JOIN conversations c ON c.business_id = b.id
           WHERE c.id = ?`)
        .get(conversationId);
      if (!business) return;

      const inMsgId = uuidv4();
      db.prepare(
        'INSERT INTO messages (id, conversation_id, direction, content, whatsapp_id, status) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(inMsgId, conversationId, 'inbound', reply, `demo_in_${inMsgId}`, 'received');

      const totalResponses =
        parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_responses'").get()?.value || '0') + 1;
      db.prepare("UPDATE settings SET value = ? WHERE key = 'total_responses'").run(String(totalResponses));
      db.prepare("UPDATE businesses SET status = 'responded' WHERE id = ?").run(business.id);
      db.prepare('UPDATE conversations SET updated_at = unixepoch() WHERE id = ?').run(conversationId);

      const incomingMsg = {
        id: inMsgId,
        conversation_id: conversationId,
        direction: 'inbound',
        content: reply,
        timestamp: Math.floor(Date.now() / 1000),
        status: 'received',
        business,
      };
      emit('message:new', incomingMsg);

      console.log(`[DEMO] ← ${business.name}: ${reply}`);

      // Auto-reply to the simulated response
      const autoReply = db.prepare("SELECT value FROM settings WHERE key = 'auto_reply'").get();
      if (autoReply?.value !== 'true') return;

      const history = db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC')
        .all(conversationId);
      const { message: replyText, model } = await generateAutoReply(business, history, reply);
      await sendMessage(phone, replyText, conversationId, model);
    } catch (err) {
      console.error('[DEMO] Simulate reply error:', err.message);
    }
  }, 8000 + Math.random() * 7000);
}

function updateStatus(status) {
  db.prepare("UPDATE settings SET value = ? WHERE key = 'whatsapp_status'").run(status);
}

function getStatus() {
  return {
    status: db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_status'").get()?.value || 'disconnected',
    isReady,
    qr: currentQR,
  };
}

async function disconnect() {
  if (client) {
    await client.destroy();
    client = null;
    isReady = false;
    updateStatus('disconnected');
    emit('whatsapp:status', { status: 'disconnected' });
  }
}

module.exports = { initialize, setIO, sendMessage, getStatus, disconnect };
