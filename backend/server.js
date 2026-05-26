require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const whatsapp = require('./services/whatsapp');
const scheduler = require('./services/scheduler');
const db = require('./db');

const businessesRouter = require('./routes/businesses');
const conversationsRouter = require('./routes/conversations');
const settingsRouter = require('./routes/settings');
const whatsappRouter = require('./routes/whatsapp');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

app.use('/api/businesses', businessesRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/whatsapp', whatsappRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    whatsapp: whatsapp.getStatus().status,
  });
});

io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id);
  socket.emit('whatsapp:status', whatsapp.getStatus());
  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id);
  });
});

whatsapp.setIO(io);
scheduler.setIO(io);

async function seedInitialBusinesses() {
  const count = db.prepare('SELECT COUNT(*) as c FROM businesses').get().c;
  if (count > 0) return;

  console.log('[Seed] Adding initial Israeli businesses...');
  const seed = require('./data/seed');
  seed();
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
  console.log(`\n🚀 YourZon WhatsApp Backend running on port ${PORT}`);
  console.log(`📱 API: http://localhost:${PORT}/api`);
  console.log('');

  await seedInitialBusinesses();

  console.log('[WhatsApp] Initializing client...');
  whatsapp.initialize().catch((err) => {
    console.error('[WhatsApp] Init failed:', err.message);
  });

  scheduler.startScheduler();
  console.log('[Scheduler] Daily automation started');
});

process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  await whatsapp.disconnect();
  process.exit(0);
});
