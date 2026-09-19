// SQLite database setup. Uses better-sqlite3 (synchronous, file-based, no server needed).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT NOT NULL,
  caption TEXT,
  is_daily_opener INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  last_posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS caption_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  caption_used TEXT,
  was_opener INTEGER NOT NULL DEFAULT 0,
  posted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS daily_overrides (
  date TEXT PRIMARY KEY,
  quota INTEGER
);
`);

// Seed default settings if missing
const defaultSettings = {
  opener_window_start: process.env.OPENER_WINDOW_START || '07:00',
  opener_window_end: process.env.OPENER_WINDOW_END || '08:00',
  min_interval_minutes: process.env.MIN_INTERVAL_MINUTES || '30',
  max_interval_minutes: process.env.MAX_INTERVAL_MINUTES || '90',
  min_daily_quota: process.env.MIN_DAILY_QUOTA || '6',
  max_daily_quota: process.env.MAX_DAILY_QUOTA || '12',
  cooldown_hours: process.env.COOLDOWN_HOURS || '48',
  opener_caption: 'Now Opened 🔓 — tap for available products 👉'
};

const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, String(value));
}

// Seed a starter caption pool if empty
const poolCount = db.prepare('SELECT COUNT(*) AS c FROM caption_pool').get().c;
if (poolCount === 0) {
  const starterCaptions = [
    'Available now, grab yours',
    '2 units left, grab yours now',
    'In stock — while it lasts',
    'Fresh drop, available now',
    'Limited stock, don\'t miss out',
    'New arrival, now available',
    'Selling fast — few left',
    'Available now, DM to order',
    'Back in stock, grab yours',
    'Still available, grab it'
  ];
  const insertCaption = db.prepare('INSERT INTO caption_pool (text) VALUES (?)');
  const insertMany = db.transaction((rows) => {
    for (const c of rows) insertCaption.run(c);
  });
  insertMany(starterCaptions);
}

module.exports = db;
