const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const validUser = username === process.env.ADMIN_USERNAME;
  const hash = process.env.ADMIN_PASSWORD_HASH || '';

  if (!validUser || !hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPass = bcrypt.compareSync(password || '', hash);
  if (!validPass) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.loggedIn = true;
  req.session.username = username;
  return res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
});

module.exports = router;
