const express = require('express');
const whatsapp = require('../services/whatsapp');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(whatsapp.getStatus());
});

router.post('/disconnect', async (req, res) => {
  try {
    await whatsapp.disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-test', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }

  const cleanPhone = phone.replace(/[^0-9]/g, '');

  try {
    await whatsapp.sendMessage(cleanPhone, message, 'test-conv', null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
