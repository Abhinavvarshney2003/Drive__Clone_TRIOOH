const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../auth');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role)
      VALUES (?, ?, ?, ?, 'viewer')
    `).run(id, name.trim(), email.toLowerCase().trim(), hash);

    // Log activity
    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), id, name.trim(), 'registered', 'New account created');

    const user = db.prepare('SELECT id, name, email, role, storage_quota, storage_used FROM users WHERE id = ?').get(id);
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    db.prepare('UPDATE users SET last_active = unixepoch() WHERE id = ?').run(user.id);

    // Log activity
    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), user.id, user.name, 'logged_in', 'User logged in');

    const { password_hash, ...safeUser } = user;
    const accessToken = generateAccessToken(safeUser);
    const refreshToken = generateRefreshToken(safeUser);

    res.json({ user: safeUser, accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const payload = verifyRefreshToken(refreshToken);
    const user = db.prepare('SELECT id, name, email, role, storage_quota, storage_used FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
