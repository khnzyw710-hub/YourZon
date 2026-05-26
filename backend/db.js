const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'yourzon.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    business_type TEXT NOT NULL,
    city TEXT NOT NULL,
    website TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    last_contacted INTEGER,
    contact_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    whatsapp_chat_id TEXT,
    stage TEXT DEFAULT 'outreach',
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    content TEXT NOT NULL,
    ai_model TEXT,
    whatsapp_id TEXT,
    status TEXT DEFAULT 'pending',
    timestamp INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_business ON conversations(business_id);
`);

const defaultSettings = {
  daily_send_hour: '9',
  daily_send_minute: '0',
  messages_per_day: '10',
  auto_reply: 'true',
  owner_name: 'YourZon',
  whatsapp_status: 'disconnected',
  total_sent: '0',
  total_responses: '0',
};

const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [k, v] of Object.entries(defaultSettings)) {
  insertSetting.run(k, v);
}

module.exports = db;
