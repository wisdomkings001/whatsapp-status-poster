const express = require('express');
const db = require('../db');

const router = express.Router();

const KEYS = [
  'opener_window_start',
  'opener_window_end',
  'min_interval_minutes',
  'max_interval_minutes',
  'min_daily_quota',
  'max_daily_quota',
  'cooldown_hours',
  'opener_caption'
];

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction(() => {
    for (const key of KEYS) {
      if (body[key] !== undefined) stmt.run(key, String(body[key]));
    }
  });
  tx();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  res.json(out);
});

// Override today's regular-post quota
router.post('/override', (req, res) => {
  const { date, quota } = req.body || {};
  if (!date || quota === undefined) {
    return res.status(400).json({ error: 'date and quota are required' });
  }
  db.prepare(
    'INSERT INTO daily_overrides (date, quota) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET quota = excluded.quota'
  ).run(date, Number(quota));
  res.json({ ok: true, date, quota: Number(quota) });
});

router.get('/log', (req, res) => {
  const rows = db.prepare(
    `SELECT post_log.*, products.image_path
     FROM post_log
     LEFT JOIN products ON products.id = post_log.product_id
     ORDER BY post_log.posted_at DESC
     LIMIT 200`
  ).all();
  res.json(rows);
});

module.exports = router;
