const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const { status, city, type, search } = req.query;
  let query = 'SELECT * FROM businesses WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (city) { query += ' AND city LIKE ?'; params.push(`%${city}%`); }
  if (type) { query += ' AND business_type = ?'; params.push(type); }
  if (search) {
    query += ' AND (name LIKE ? OR phone LIKE ? OR city LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY created_at DESC';
  const businesses = db.prepare(query).all(...params);
  res.json({ businesses, total: businesses.length });
});

router.get('/stats', (req, res) => {
  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM businesses').get().c,
    pending: db.prepare("SELECT COUNT(*) as c FROM businesses WHERE status = 'pending'").get().c,
    contacted: db.prepare("SELECT COUNT(*) as c FROM businesses WHERE status = 'contacted'").get().c,
    responded: db.prepare("SELECT COUNT(*) as c FROM businesses WHERE status = 'responded'").get().c,
    converted: db.prepare("SELECT COUNT(*) as c FROM businesses WHERE status = 'converted'").get().c,
    sentToday: db.prepare(
      "SELECT COUNT(*) as c FROM messages WHERE direction = 'outbound' AND timestamp > unixepoch() - 86400"
    ).get().c,
    totalSent: parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_sent'").get()?.value || '0'),
    totalResponses: parseInt(db.prepare("SELECT value FROM settings WHERE key = 'total_responses'").get()?.value || '0'),
  };
  res.json(stats);
});

router.get('/:id', (req, res) => {
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  res.json(business);
});

router.post('/', (req, res) => {
  const { name, phone, business_type, city, website, notes } = req.body;
  if (!name || !phone || !business_type || !city) {
    return res.status(400).json({ error: 'Missing required fields: name, phone, business_type, city' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const id = uuidv4();
  db.prepare(
    'INSERT INTO businesses (id, name, phone, business_type, city, website, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, cleanPhone, business_type, city, website || null, notes || null);

  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
  res.status(201).json(business);
});

router.post('/bulk', (req, res) => {
  const { businesses } = req.body;
  if (!Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses must be an array' });
  }

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO businesses (id, name, phone, business_type, city, website, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((items) => {
    let inserted = 0;
    for (const b of items) {
      if (!b.name || !b.phone || !b.business_type || !b.city) continue;
      const cleanPhone = b.phone.replace(/[^0-9]/g, '');
      insertStmt.run(uuidv4(), b.name, cleanPhone, b.business_type, b.city, b.website || null, b.notes || null);
      inserted++;
    }
    return inserted;
  });

  const inserted = insertMany(businesses);
  res.json({ inserted, total: businesses.length });
});

router.put('/:id', (req, res) => {
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id);
  if (!business) return res.status(404).json({ error: 'Business not found' });

  const { name, phone, business_type, city, website, notes, status } = req.body;
  db.prepare(
    `UPDATE businesses
     SET name = ?, phone = ?, business_type = ?, city = ?, website = ?, notes = ?, status = ?
     WHERE id = ?`
  ).run(
    name || business.name,
    phone ? phone.replace(/[^0-9]/g, '') : business.phone,
    business_type || business.business_type,
    city || business.city,
    website !== undefined ? website : business.website,
    notes !== undefined ? notes : business.notes,
    status || business.status,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id);
  if (!business) return res.status(404).json({ error: 'Business not found' });
  db.prepare('DELETE FROM businesses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
