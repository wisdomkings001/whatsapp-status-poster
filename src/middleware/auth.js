function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireAuth };
