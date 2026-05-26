const express = require('express');
const db = require('../db');
const whatsapp = require('../services/whatsapp');

const router = express.Router();

router.get('/', (req, res) => {
  const conversations = db.prepare(`
    SELECT
      c.*,
      b.name as business_name,
      b.business_type,
      b.city,
      b.phone,
      b.status as business_status,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message,
      (SELECT timestamp FROM messages WHERE conversation_id = c.id ORDER BY timestamp DESC LIMIT 1) as last_message_time,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND direction = 'inbound') as inbound_count,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
    FROM conversations c
    JOIN businesses b ON c.business_id = b.id
    ORDER BY c.updated_at DESC
  `).all();
  res.json({ conversations, total: conversations.length });
});

router.get('/:id', (req, res) => {
  const conversation = db.prepare(`
    SELECT c.*, b.name as business_name, b.business_type, b.city, b.phone, b.status as business_status
    FROM conversations c
    JOIN businesses b ON c.business_id = b.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  const messages = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
  ).all(req.params.id);

  res.json({ ...conversation, messages });
});

router.post('/:id/send', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  const conversation = db.prepare(`
    SELECT c.*, b.phone FROM conversations c
    JOIN businesses b ON c.business_id = b.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

  try {
    const sent = await whatsapp.sendMessage(conversation.phone, message, req.params.id, null);
    db.prepare('UPDATE conversations SET updated_at = unixepoch() WHERE id = ?').run(req.params.id);
    res.json(sent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/stage', (req, res) => {
  const { stage } = req.body;
  const validStages = ['outreach', 'interested', 'meeting', 'closed', 'not_interested'];
  if (!validStages.includes(stage)) {
    return res.status(400).json({ error: `stage must be one of: ${validStages.join(', ')}` });
  }
  db.prepare('UPDATE conversations SET stage = ?, updated_at = unixepoch() WHERE id = ?').run(
    stage,
    req.params.id
  );
  res.json({ success: true, stage });
});

module.exports = router;
