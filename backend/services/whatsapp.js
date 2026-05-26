const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateAutoReply } = require('./ai');

let client = null;
let io = null;
let isReady = false;
let currentQR = null;

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

async function initialize() {
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
      ],
    },
  });

  client.on('qr', async (qr) => {
    try {
      currentQR = await qrcode.toDataURL(qr);
      updateStatus('qr_ready');
      emit('whatsapp:qr', { qr: currentQR });
      console.log('[WhatsApp] QR code generated - scan with your phone');
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
  if (!isReady || !client) {
    throw new Error('WhatsApp client not ready');
  }

  const chatId = `${phone}@c.us`;

  try {
    const sentMsg = await client.sendMessage(chatId, text);

    const msgId = uuidv4();
    db.prepare(
      'INSERT INTO messages (id, conversation_id, direction, content, ai_model, whatsapp_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(msgId, conversationId, 'outbound', text, aiModel, sentMsg.id._serialized, 'sent');

    const totalSent =
      parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_sent'").get()?.value || '0') + 1;
    db.prepare("UPDATE settings SET value = ? WHERE key = 'total_sent'").run(
      String(totalSent)
    );

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
  } catch (err) {
    console.error('[WhatsApp] Send error:', err.message);
    throw err;
  }
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
