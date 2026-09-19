const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only image files are allowed (jpg, png, webp, gif)'));
    }
    cb(null, true);
  }
});

// List all products
router.get('/', (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json(products);
});

// Create a product (with image upload)
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const { caption = '', is_daily_opener } = req.body;
  const isOpener = is_daily_opener === 'true' || is_daily_opener === '1' ? 1 : 0;

  const imagePath = `/uploads/products/${req.file.filename}`;

  if (isOpener) {
    // Only one product can be the daily opener at a time
    db.prepare('UPDATE products SET is_daily_opener = 0 WHERE is_daily_opener = 1').run();
  }

  const stmt = db.prepare(
    'INSERT INTO products (image_path, caption, is_daily_opener) VALUES (?, ?, ?)'
  );
  const result = stmt.run(imagePath, caption, isOpener);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
});

// Update a product (caption, active flag, opener flag; optionally new image)
router.put('/:id', upload.single('image'), (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const { caption, is_daily_opener, active } = req.body;
  let imagePath = existing.image_path;

  if (req.file) {
    imagePath = `/uploads/products/${req.file.filename}`;
    // Remove old image file
    const oldFull = path.join(__dirname, '..', '..', existing.image_path);
    fs.unlink(oldFull, () => {});
  }

  const isOpener = is_daily_opener === undefined
    ? existing.is_daily_opener
    : (is_daily_opener === 'true' || is_daily_opener === '1' ? 1 : 0);

  if (isOpener === 1) {
    db.prepare('UPDATE products SET is_daily_opener = 0 WHERE is_daily_opener = 1 AND id != ?').run(id);
  }

  const isActive = active === undefined
    ? existing.active
    : (active === 'true' || active === '1' ? 1 : 0);

  db.prepare(
    'UPDATE products SET caption = ?, is_daily_opener = ?, active = ?, image_path = ? WHERE id = ?'
  ).run(
    caption !== undefined ? caption : existing.caption,
    isOpener,
    isActive,
    imagePath,
    id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  res.json(updated);
});

// Delete a product
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const fullPath = path.join(__dirname, '..', '..', existing.image_path);
  fs.unlink(fullPath, () => {});
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Caption pool management
router.get('/captions/pool', (req, res) => {
  res.json(db.prepare('SELECT * FROM caption_pool ORDER BY id DESC').all());
});

router.post('/captions/pool', (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Caption text required' });
  const result = db.prepare('INSERT INTO caption_pool (text) VALUES (?)').run(text.trim());
  res.status(201).json({ id: result.lastInsertRowid, text: text.trim() });
});

router.delete('/captions/pool/:id', (req, res) => {
  db.prepare('DELETE FROM caption_pool WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
