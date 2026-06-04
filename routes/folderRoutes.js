const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

function logActivity(userId, userName, action, resourceType, resourceName, details) {
  try {
    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, resource_type, resource_name, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), userId, userName, action, resourceType, resourceName, details || null);
  } catch (e) { /* silent */ }
}

// GET /api/folders?parent_id=&view=starred|trashed|shared
router.get('/', (req, res) => {
  try {
    const { parent_id, view } = req.query;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'super_admin';
    let folders;

    if (view === 'starred') {
      folders = db.prepare(`SELECT fo.*, u.name as owner_name FROM folders fo
        LEFT JOIN users u ON fo.owner_id = u.id
        WHERE (fo.owner_id = ? OR ? = 1) AND fo.is_starred = 1 AND fo.is_trashed = 0
        ORDER BY fo.name ASC`).all(userId, isAdmin ? 1 : 0);
    } else if (view === 'trashed') {
      folders = db.prepare(`SELECT fo.*, u.name as owner_name FROM folders fo
        LEFT JOIN users u ON fo.owner_id = u.id
        WHERE (fo.owner_id = ? OR ? = 1) AND fo.is_trashed = 1
        ORDER BY fo.name ASC`).all(userId, isAdmin ? 1 : 0);
    } else if (view === 'shared') {
      folders = db.prepare(`SELECT fo.*, u.name as owner_name FROM folders fo
        LEFT JOIN shares s ON s.resource_id = fo.id AND s.resource_type = 'folder'
        LEFT JOIN users u ON fo.owner_id = u.id
        WHERE s.shared_with = ? AND fo.is_trashed = 0`).all(userId);
    } else {
      if (parent_id && parent_id !== 'null') {
        folders = db.prepare(`SELECT fo.*, u.name as owner_name FROM folders fo
          LEFT JOIN users u ON fo.owner_id = u.id
          WHERE fo.parent_id = ? AND (fo.owner_id = ? OR ? = 1) AND fo.is_trashed = 0
          ORDER BY fo.name ASC`).all(parent_id, userId, isAdmin ? 1 : 0);
      } else {
        folders = db.prepare(`SELECT fo.*, u.name as owner_name FROM folders fo
          LEFT JOIN users u ON fo.owner_id = u.id
          WHERE fo.parent_id IS NULL AND (fo.owner_id = ? OR ? = 1) AND fo.is_trashed = 0
          ORDER BY fo.name ASC`).all(userId, isAdmin ? 1 : 0);
      }
    }

    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/folders
router.post('/', requireRole('editor'), (req, res) => {
  try {
    const { name, parent_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const id = uuidv4();
    const parentId = parent_id && parent_id !== 'null' ? parent_id : null;

    db.prepare(`INSERT INTO folders (id, name, parent_id, owner_id) VALUES (?, ?, ?, ?)`)
      .run(id, name.trim(), parentId, req.user.id);

    logActivity(req.user.id, req.user.name, 'created_folder', 'folder', name);
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
    res.status(201).json({ folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/folders/:id/path — breadcrumb
router.get('/:id/path', (req, res) => {
  try {
    const path = [];
    let currentId = req.params.id;

    while (currentId) {
      const folder = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(currentId);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parent_id;
    }

    res.json({ path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/folders/:id — rename
router.patch('/:id', requireRole('editor'), (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (folder.owner_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE folders SET name = ?, updated_at = unixepoch() WHERE id = ?').run(name.trim(), req.params.id);
    logActivity(req.user.id, req.user.name, 'renamed', 'folder', name);

    const updated = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    res.json({ folder: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/folders/:id/star
router.patch('/:id/star', (req, res) => {
  try {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    db.prepare('UPDATE folders SET is_starred = ?, updated_at = unixepoch() WHERE id = ?').run(folder.is_starred ? 0 : 1, req.params.id);
    const updated = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    res.json({ folder: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/folders/:id/trash
router.patch('/:id/trash', requireRole('editor'), (req, res) => {
  try {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (folder.owner_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE folders SET is_trashed = ?, updated_at = unixepoch() WHERE id = ?').run(folder.is_trashed ? 0 : 1, req.params.id);
    logActivity(req.user.id, req.user.name, folder.is_trashed ? 'restored' : 'trashed', 'folder', folder.name);
    const updated = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    res.json({ folder: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/folders/:id
router.delete('/:id', requireRole('editor'), (req, res) => {
  try {
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (folder.owner_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);
    logActivity(req.user.id, req.user.name, 'deleted', 'folder', folder.name);
    res.json({ message: 'Folder deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/folders/:id/share
router.post('/:id/share', requireRole('editor'), (req, res) => {
  try {
    const { shared_with_email, permission } = req.body;
    const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const sharedWith = db.prepare('SELECT id FROM users WHERE email = ?').get(shared_with_email?.toLowerCase().trim());
    if (!sharedWith) return res.status(404).json({ error: 'User not found' });

    const existing = db.prepare("SELECT id FROM shares WHERE resource_id = ? AND shared_with = ? AND resource_type = 'folder'").get(folder.id, sharedWith.id);
    if (existing) {
      db.prepare("UPDATE shares SET permission = ? WHERE id = ?").run(permission || 'view', existing.id);
    } else {
      db.prepare(`INSERT INTO shares (id, resource_type, resource_id, shared_by, shared_with, permission) VALUES (?, 'folder', ?, ?, ?, ?)`)
        .run(uuidv4(), folder.id, req.user.id, sharedWith.id, permission || 'view');
    }

    logActivity(req.user.id, req.user.name, 'shared', 'folder', folder.name, `Shared with ${shared_with_email}`);
    res.json({ message: 'Folder shared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
