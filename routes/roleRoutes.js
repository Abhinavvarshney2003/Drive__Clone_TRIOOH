const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// GET /api/roles — list all roles with their permissions
router.get('/', (req, res) => {
  try {
    const roles = db.prepare(`SELECT * FROM roles ORDER BY name ASC`).all();
    const result = roles.map(role => {
      const permissions = db.prepare(`
        SELECT p.* FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        WHERE rp.role_id = ?
        ORDER BY p.name ASC
      `).all(role.id);
      return { ...role, permissions };
    });
    res.json({ roles: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roles/:id
router.get('/:id', (req, res) => {
  try {
    const role = db.prepare(`SELECT * FROM roles WHERE id = ?`).get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const permissions = db.prepare(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ? ORDER BY p.name ASC
    `).all(role.id);

    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.role FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role_id = ? ORDER BY u.name ASC
    `).all(role.id);

    res.json({ role: { ...role, permissions, users } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roles — create role (super_admin only)
router.post('/', requireRole('super_admin'), (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const existing = db.prepare('SELECT id FROM roles WHERE name = ?').get(name.trim());
    if (existing) return res.status(409).json({ error: 'Role already exists' });

    const id = uuidv4();
    db.prepare('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)').run(id, name.trim(), description || null);
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
    res.status(201).json({ role: { ...role, permissions: [] } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/roles/:id — update role
router.put('/:id', requireRole('super_admin'), (req, res) => {
  try {
    const { name, description } = req.body;
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (!name && description === undefined) return res.status(400).json({ error: 'Nothing to update' });

    const newName = name ? name.trim() : role.name;
    const newDesc = description !== undefined ? description : role.description;
    db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?').run(newName, newDesc, req.params.id);

    const updated = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    const permissions = db.prepare(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ? ORDER BY p.name ASC
    `).all(req.params.id);
    res.json({ role: { ...updated, permissions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/roles/:id
router.delete('/:id', requireRole('super_admin'), (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    db.prepare('DELETE FROM roles WHERE id = ?').run(req.params.id);
    res.json({ message: 'Role deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roles/:id/permissions — assign permissions to role
router.post('/:id/permissions', requireRole('super_admin'), (req, res) => {
  try {
    const { permission_ids } = req.body;
    if (!Array.isArray(permission_ids) || permission_ids.length === 0) {
      return res.status(400).json({ error: 'permission_ids array is required' });
    }

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const insertPerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    const insertMany = db.transaction((ids) => {
      for (const pid of ids) {
        const perm = db.prepare('SELECT id FROM permissions WHERE id = ?').get(pid);
        if (perm) insertPerm.run(req.params.id, pid);
      }
    });
    insertMany(permission_ids);

    const permissions = db.prepare(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ? ORDER BY p.name ASC
    `).all(req.params.id);
    res.json({ role: { ...role, permissions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/roles/:id/permissions/:permission_id — remove permission from role
router.delete('/:id/permissions/:permission_id', requireRole('super_admin'), (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    db.prepare('DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?').run(req.params.id, req.params.permission_id);

    const permissions = db.prepare(`
      SELECT p.* FROM permissions p
      JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ? ORDER BY p.name ASC
    `).all(req.params.id);
    res.json({ role: { ...role, permissions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
