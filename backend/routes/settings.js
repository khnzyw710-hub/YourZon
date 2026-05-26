const express = require('express');
const db = require('../db');
const { refreshKeys } = require('../services/ai');
const { startScheduler, stopScheduler, runDailySend, getNextRunTime } = require('../services/scheduler');

const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  settings.next_run = getNextRunTime();
  res.json(settings);
});

router.put('/', (req, res) => {
  const allowed = [
    'daily_send_hour',
    'daily_send_minute',
    'messages_per_day',
    'auto_reply',
    'owner_name',
  ];

  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid settings provided' });
  }

  const stmt = db.prepare(
    'UPDATE settings SET value = ?, updated_at = unixepoch() WHERE key = ?'
  );
  const updateMany = db.transaction((items) => {
    for (const [key, value] of items) {
      stmt.run(String(value), key);
    }
  });
  updateMany(updates);

  if (updates.some(([k]) => k === 'daily_send_hour' || k === 'daily_send_minute')) {
    startScheduler();
  }

  res.json({ success: true });
});

router.post('/api-keys', (req, res) => {
  const { gemini_api_key, claude_api_key } = req.body;

  if (gemini_api_key) {
    process.env.GEMINI_API_KEY = gemini_api_key;
  }
  if (claude_api_key) {
    process.env.CLAUDE_API_KEY = claude_api_key;
  }

  refreshKeys();
  res.json({ success: true });
});

router.post('/scheduler/start', (req, res) => {
  startScheduler();
  res.json({ success: true, next_run: getNextRunTime() });
});

router.post('/scheduler/stop', (req, res) => {
  stopScheduler();
  res.json({ success: true });
});

router.post('/scheduler/run-now', async (req, res) => {
  try {
    const result = await runDailySend(true);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
