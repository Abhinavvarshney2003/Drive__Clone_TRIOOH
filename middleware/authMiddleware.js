const { verifyAccessToken } = require('../auth');
const { db } = require('../db');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    // Refresh user from DB to get latest role
    const user = db.prepare('SELECT id, name, email, role, storage_quota, storage_used FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Update last_active
    db.prepare('UPDATE users SET last_active = unixepoch() WHERE id = ?').run(user.id);

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
