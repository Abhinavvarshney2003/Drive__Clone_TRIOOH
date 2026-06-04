const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// GET /api/permissions — list all permissions
router.get('/', (req, res) => {
  try {
    const permissions = db.prepare(`SELECT * FROM permissions ORDER BY name ASC`).all();
    res.json({ permissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/permissions/:id
router.get('/:id', (req, res) => {
  try {
    const permission = db.prepare(`SELECT * FROM permissions WHERE id = ?`).get(req.params.id);
    if (!permission) return res.status(404).json({ error: 'Permission not found' });

    // Which roles have this permission
    const roles = db.prepare(`
      SELECT r.* FROM roles r
      JOIN role_permissions rp ON rp.role_id = r.id
      WHERE rp.permission_id = ? ORDER BY r.name ASC
    `).all(req.params.id);

    res.json({ permission: { ...permission, roles } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/permissions — create permission (super_admin only)
router.post('/', requireRole('super_admin'), (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const existing = db.prepare('SELECT id FROM permissions WHERE name = ?').get(name.trim());
    if (existing) return res.status(409).json({ error: 'Permission already exists' });

    const id = uuidv4();
    db.prepare('INSERT INTO permissions (id, name, description) VALUES (?, ?, ?)').run(id, name.trim(), description || null);
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(id);
    res.status(201).json({ permission });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/permissions/:id — delete permission (super_admin only)
router.delete('/:id', requireRole('super_admin'), (req, res) => {
  try {
    const permission = db.prepare('SELECT * FROM permissions WHERE id = ?').get(req.params.id);
    if (!permission) return res.status(404).json({ error: 'Permission not found' });
    db.prepare('DELETE FROM permissions WHERE id = ?').run(req.params.id);
    res.json({ message: 'Permission deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
