const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// GET /api/users — all users (admin only)
router.get('/', requireRole('super_admin'), (req, res) => {
  try {
    const users = db.prepare(`SELECT id, name, email, role, storage_quota, storage_used, created_at, last_active FROM users ORDER BY created_at DESC`).all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/stats — system stats (admin only)
router.get('/stats', requireRole('super_admin'), (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalFiles = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_trashed = 0').get().count;
    const totalFolders = db.prepare('SELECT COUNT(*) as count FROM folders WHERE is_trashed = 0').get().count;
    const totalStorage = db.prepare('SELECT SUM(size) as total FROM files WHERE is_trashed = 0').get().total || 0;
    const byRole = db.prepare(`SELECT role, COUNT(*) as count FROM users GROUP BY role`).all();
    const recentActivity = db.prepare(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 20`).all();

    res.json({ totalUsers, totalFiles, totalFolders, totalStorage, byRole, recentActivity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/activity — activity log (admin only)
router.get('/activity', requireRole('super_admin'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const activity = db.prepare(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?`).all(limit);
    res.json({ activity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', requireRole('super_admin'), (req, res) => {
  try {
    const user = db.prepare(`SELECT id, name, email, role, storage_quota, storage_used, created_at, last_active FROM users WHERE id = ?`).get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const files = db.prepare('SELECT COUNT(*) as count, SUM(size) as total_size FROM files WHERE owner_id = ? AND is_trashed = 0').get(req.params.id);
    const folders = db.prepare('SELECT COUNT(*) as count FROM folders WHERE owner_id = ? AND is_trashed = 0').get(req.params.id);
    const recentActivity = db.prepare('SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(req.params.id);

    // Roles assigned via RBAC user_roles table
    const rbacRoles = db.prepare(`
      SELECT r.* FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ? ORDER BY r.name ASC
    `).all(req.params.id);

    res.json({ user, stats: { files: files.count, total_size: files.total_size || 0, folders: folders.count }, recentActivity, rbacRoles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — create user (admin only)
router.post('/', requireRole('super_admin'), (req, res) => {
  try {
    const { name, email, password, role, storage_quota } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

    const validRoles = ['viewer', 'editor', 'super_admin'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    const id = uuidv4();
    const quota = storage_quota || 5368709120; // 5 GB default

    db.prepare(`INSERT INTO users (id, name, email, password_hash, role, storage_quota) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, name.trim(), email.toLowerCase().trim(), hash, role || 'viewer', quota);

    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.user.id, req.user.name, 'created_user', `Created user: ${email}`);

    const user = db.prepare('SELECT id, name, email, role, storage_quota, storage_used, created_at, last_active FROM users WHERE id = ?').get(id);
    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id — update user
router.patch('/:id', requireRole('super_admin'), (req, res) => {
  try {
    const { name, role, storage_quota, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const validRoles = ['viewer', 'editor', 'super_admin'];
    if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name.trim()); }
    if (role) { updates.push('role = ?'); values.push(role); }
    if (storage_quota !== undefined) { updates.push('storage_quota = ?'); values.push(storage_quota); }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      updates.push('password_hash = ?');
      values.push(bcrypt.hashSync(password, 10));
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.user.id, req.user.name, 'updated_user', `Updated user: ${user.email}${role ? ` → role: ${role}` : ''}`);

    const updated = db.prepare('SELECT id, name, email, role, storage_quota, storage_used, created_at, last_active FROM users WHERE id = ?').get(req.params.id);
    res.json({ user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireRole('super_admin'), (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.user.id, req.user.name, 'deleted_user', `Deleted user: ${user.email}`);

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/assign-role — assign RBAC role to user
router.post('/:id/assign-role', requireRole('super_admin'), (req, res) => {
  try {
    const { role_id } = req.body;
    if (!role_id) return res.status(400).json({ error: 'role_id is required' });

    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(role_id);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(req.params.id, role_id);

    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, details) VALUES (?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.user.id, req.user.name, 'assigned_role', `Assigned role "${role.name}" to ${user.email}`);

    const roles = db.prepare(`
      SELECT r.* FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ? ORDER BY r.name ASC
    `).all(req.params.id);

    res.json({ message: 'Role assigned', user: { ...user, roles } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id/roles/:role_id — remove RBAC role from user
router.delete('/:id/roles/:role_id', requireRole('super_admin'), (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?').run(req.params.id, req.params.role_id);

    const roles = db.prepare(`
      SELECT r.* FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ? ORDER BY r.name ASC
    `).all(req.params.id);

    res.json({ message: 'Role removed', user: { ...user, roles } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
