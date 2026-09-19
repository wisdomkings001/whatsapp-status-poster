require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');

const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const settingsRoutes = require('./src/routes/settings');
const { requireAuth } = require('./src/middleware/auth');
const bot = require('./src/whatsapp/bot');
const scheduler = require('./src/scheduler/scheduler');
const logger = require('./src/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: 'session',
    secret: process.env.SESSION_SECRET || 'insecure_dev_secret_change_me',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  })
);

// Public static files (login page + shared assets)
app.use(express.static(path.join(__dirname, 'public')));
// Serve uploaded product images (needed for the admin panel previews)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth routes (login/logout) are public
app.use('/api/auth', authRoutes);

// Everything else under /api requires an authenticated admin session
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);

app.get('/api/whatsapp/status', requireAuth, (req, res) => {
  res.json(bot.getStatus());
});

app.get('/api/schedule/today', requireAuth, (req, res) => {
  res.json(scheduler.getTodaysPlan());
});

app.post('/api/schedule/rebuild', requireAuth, (req, res) => {
  scheduler.scheduleToday();
  res.json({ ok: true, plan: scheduler.getTodaysPlan() });
});

// Root: send to admin panel (auth-gated client-side via /api/auth/me)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  // Multer validation errors (bad file type, file too large) are client errors, not server errors
  const isValidationError =
    err.message && (err.message.includes('Only image files') || err.code === 'LIMIT_FILE_SIZE');
  const status = isValidationError ? 400 : 500;
  if (status === 500) logger.error('Unhandled error:', err.message);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`Admin panel running at http://localhost:${PORT}`);
  bot.init();
  scheduler.init();
});
