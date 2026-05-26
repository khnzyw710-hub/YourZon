const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { generateOutreachMessage } = require('./ai');
const whatsapp = require('./whatsapp');

let currentJob = null;
let io = null;

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

function getScheduleExpression() {
  const hour = getSetting('daily_send_hour') || '9';
  const minute = getSetting('daily_send_minute') || '0';
  return `${minute} ${hour} * * *`;
}

function startScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }

  const expression = getScheduleExpression();
  console.log(`[Scheduler] Starting with cron: ${expression}`);

  currentJob = cron.schedule(expression, () => {
    console.log('[Scheduler] Running daily send job');
    runDailySend();
  });

  emit('scheduler:status', { running: true, expression });
}

function stopScheduler() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    emit('scheduler:status', { running: false });
    console.log('[Scheduler] Stopped');
  }
}

async function runDailySend(forceSend = false) {
  const status = whatsapp.getStatus();
  if (!status.isReady && !forceSend) {
    console.log('[Scheduler] WhatsApp not ready, skipping daily send');
    emit('scheduler:skipped', { reason: 'WhatsApp not connected' });
    return { sent: 0, failed: 0, skipped: true };
  }

  const limit = parseInt(getSetting('messages_per_day') || '10');
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  const businesses = db
    .prepare(
      `SELECT * FROM businesses
       WHERE status = 'pending'
         AND (last_contacted IS NULL OR last_contacted < ?)
       ORDER BY created_at ASC
       LIMIT ?`
    )
    .all(sevenDaysAgo, limit);

  if (businesses.length === 0) {
    console.log('[Scheduler] No businesses to contact today');
    emit('scheduler:done', { sent: 0, failed: 0, message: 'No pending businesses' });
    return { sent: 0, failed: 0 };
  }

  console.log(`[Scheduler] Sending to ${businesses.length} businesses`);
  emit('scheduler:started', { total: businesses.length });

  let sent = 0;
  let failed = 0;

  for (const business of businesses) {
    try {
      await delay(2000 + Math.random() * 3000);

      const { message, model } = await generateOutreachMessage(business);

      let conversation = db
        .prepare(
          'SELECT * FROM conversations WHERE business_id = ? ORDER BY created_at DESC LIMIT 1'
        )
        .get(business.id);

      if (!conversation) {
        const convId = uuidv4();
        db.prepare(
          'INSERT INTO conversations (id, business_id, whatsapp_chat_id) VALUES (?, ?, ?)'
        ).run(convId, business.id, `${business.phone}@c.us`);
        conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
      }

      await whatsapp.sendMessage(business.phone, message, conversation.id, model);

      db.prepare(
        `UPDATE businesses
         SET status = 'contacted', last_contacted = unixepoch(), contact_count = contact_count + 1
         WHERE id = ?`
      ).run(business.id);

      sent++;
      emit('scheduler:progress', { sent, total: businesses.length, business: business.name });
      console.log(`[Scheduler] Sent to ${business.name} (${sent}/${businesses.length})`);
    } catch (err) {
      failed++;
      console.error(`[Scheduler] Failed for ${business.name}:`, err.message);
      emit('scheduler:error', { business: business.name, error: err.message });
    }
  }

  emit('scheduler:done', { sent, failed, total: businesses.length });
  console.log(`[Scheduler] Done - sent: ${sent}, failed: ${failed}`);
  return { sent, failed };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNextRunTime() {
  const hour = getSetting('daily_send_hour') || '9';
  const minute = getSetting('daily_send_minute') || '0';
  const now = new Date();
  const next = new Date();
  next.setHours(parseInt(hour), parseInt(minute), 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

module.exports = { startScheduler, stopScheduler, runDailySend, getNextRunTime, setIO };
