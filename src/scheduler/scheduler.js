const cron = require('node-cron');
const path = require('path');
const db = require('../db');
const bot = require('../whatsapp/bot');
const logger = require('../utils/logger');

let activeTimeouts = [];
let todaysPlan = [];

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

function todayDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearAllTimeouts() {
  for (const t of activeTimeouts) clearTimeout(t);
  activeTimeouts = [];
}

function pickRegularCaption(product) {
  const poolRows = db.prepare('SELECT text FROM caption_pool').all();
  const generic = poolRows.length
    ? poolRows[randomInt(0, poolRows.length - 1)].text
    : '';
  if (product.caption && product.caption.trim()) {
    return generic ? `${product.caption.trim()} — ${generic}` : product.caption.trim();
  }
  return generic;
}

function buildTodaysQueue() {
  const settings = getSettings();
  const cooldownHours = Number(settings.cooldown_hours || 48);
  const minQuota = Number(settings.min_daily_quota || 6);
  const maxQuota = Number(settings.max_daily_quota || 12);
  const minInterval = Number(settings.min_interval_minutes || 30);
  const maxInterval = Number(settings.max_interval_minutes || 90);

  const today = todayDateString();
  const override = db.prepare('SELECT quota FROM daily_overrides WHERE date = ?').get(today);
  const quota = override ? Number(override.quota) : randomInt(minQuota, maxQuota);

  const opener = db.prepare(
    'SELECT * FROM products WHERE is_daily_opener = 1 AND active = 1 LIMIT 1'
  ).get();

  const cutoffIso = new Date(Date.now() - cooldownHours * 60 * 60 * 1000).toISOString();
  const eligible = db.prepare(
    `SELECT * FROM products
     WHERE active = 1 AND is_daily_opener = 0
       AND (last_posted_at IS NULL OR last_posted_at < ?)`
  ).all(cutoffIso);

  const shuffled = shuffle(eligible);
  const selected = shuffled.slice(0, Math.min(quota, shuffled.length));

  if (shuffled.length < quota) {
    logger.warn(
      `Only ${shuffled.length} eligible products available (wanted ${quota}). ` +
      `Add more products or reduce quota / cooldown.`
    );
  }

  const now = new Date();
  const [startH, startM] = (settings.opener_window_start || '07:00').split(':').map(Number);
  const [endH, endM] = (settings.opener_window_end || '08:00').split(':').map(Number);

  const windowStart = new Date(now);
  windowStart.setHours(startH, startM, 0, 0);
  const windowEnd = new Date(now);
  windowEnd.setHours(endH, endM, 0, 0);

  const plan = [];

  let cursor;
  if (opener) {
    let openerTime;
    if (now < windowStart) {
      const spanMs = windowEnd.getTime() - windowStart.getTime();
      openerTime = new Date(windowStart.getTime() + randomInt(0, Math.max(spanMs, 0)));
    } else if (now <= windowEnd) {
      openerTime = new Date(now.getTime() + randomInt(1, 5) * 60 * 1000);
    } else {
      openerTime = new Date(now.getTime() + 60 * 1000);
    }
    plan.push({
      type: 'opener',
      product: opener,
      caption: settings.opener_caption || 'Now Opened 🔓 — tap for available products 👉',
      time: openerTime
    });
    cursor = openerTime;
  } else {
    logger.warn('No product is marked as the daily opener. Set one in the admin panel.');
    cursor = now;
  }

  for (const product of selected) {
    const gapMinutes = randomInt(minInterval, maxInterval);
    cursor = new Date(cursor.getTime() + gapMinutes * 60 * 1000);
    plan.push({
      type: 'regular',
      product,
      caption: pickRegularCaption(product),
      time: new Date(cursor)
    });
  }

  return plan;
}

async function executePlanItem(item, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 3 * 60 * 1000;
  try {
    const fullPath = path.join(__dirname, '..', '..', item.product.image_path.replace(/^\//, ''));
    await bot.postToStatus(fullPath, item.caption);
    db.prepare('UPDATE products SET last_posted_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      item.product.id
    );
    db.prepare(
      'INSERT INTO post_log (product_id, caption_used, was_opener, posted_at) VALUES (?, ?, ?, ?)'
    ).run(item.product.id, item.caption, item.type === 'opener' ? 1 : 0, new Date().toISOString());
    logger.info(`Posted ${item.type} product #${item.product.id} to Status.`);
  } catch (err) {
    const isNotReadyError = err.message && err.message.includes('not ready');
    if (isNotReadyError && attempt < MAX_ATTEMPTS) {
      logger.warn(
        `WhatsApp not ready for product #${item.product.id} (attempt ${attempt}/${MAX_ATTEMPTS}). ` +
        `Retrying in ${RETRY_DELAY_MS / 60000} minutes.`
      );
      const t = setTimeout(() => executePlanItem(item, attempt + 1), RETRY_DELAY_MS);
      activeTimeouts.push(t);
    } else {
      logger.error(`Failed to post product #${item.product.id}:`, err.message);
    }
  }
}

function scheduleToday() {
  clearAllTimeouts();
  todaysPlan = buildTodaysQueue();

  const now = Date.now();
  for (const item of todaysPlan) {
    const delay = item.time.getTime() - now;
    if (delay <= 0) continue;
    const t = setTimeout(() => executePlanItem(item), delay);
    activeTimeouts.push(t);
  }

  logger.info(`Today's plan built: ${todaysPlan.length} post(s) scheduled.`);
  todaysPlan.forEach((p) =>
    logger.info(`  - ${p.type} | product #${p.product.id} | ${p.time.toLocaleString()}`)
  );
}

function getTodaysPlan() {
  return todaysPlan.map((p) => ({
    type: p.type,
    productId: p.product.id,
    imagePath: p.product.image_path,
    caption: p.caption,
    time: p.time
  }));
}

function init() {
  cron.schedule('5 0 * * *', () => {
    logger.info('Midnight tick — rebuilding today\'s posting plan.');
    scheduleToday();
  });
  scheduleToday();
}

module.exports = { init, scheduleToday, getTodaysPlan };
