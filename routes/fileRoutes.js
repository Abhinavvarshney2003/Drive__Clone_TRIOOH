const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

const uploadsDir = path.join(__dirname, '../uploads');

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadsDir, req.user.id);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

function logActivity(userId, userName, action, resourceType, resourceName, details) {
  try {
    db.prepare(`INSERT INTO activity_log (id, user_id, user_name, action, resource_type, resource_name, details)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), userId, userName, action, resourceType, resourceName, details || null);
  } catch (e) { /* silent */ }
}

// Apply auth to all routes
router.use(authMiddleware);

// GET /api/files?folder_id=&view=all|starred|trashed|recent|shared
router.get('/', (req, res) => {
  try {
    const { folder_id, view } = req.query;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'super_admin';
    let files;

    if (view === 'starred') {
      files = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
        LEFT JOIN users u ON f.owner_id = u.id
        WHERE (f.owner_id = ? OR ? = 1) AND f.is_starred = 1 AND f.is_trashed = 0
        ORDER BY f.updated_at DESC`).all(userId, isAdmin ? 1 : 0);
    } else if (view === 'trashed') {
      files = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
        LEFT JOIN users u ON f.owner_id = u.id
        WHERE (f.owner_id = ? OR ? = 1) AND f.is_trashed = 1
        ORDER BY f.updated_at DESC`).all(userId, isAdmin ? 1 : 0);
    } else if (view === 'recent') {
      files = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
        LEFT JOIN users u ON f.owner_id = u.id
        WHERE (f.owner_id = ? OR ? = 1) AND f.is_trashed = 0
        ORDER BY f.updated_at DESC LIMIT 50`).all(userId, isAdmin ? 1 : 0);
    } else if (view === 'shared') {
      files = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
        LEFT JOIN shares s ON s.resource_id = f.id AND s.resource_type = 'file'
        LEFT JOIN users u ON f.owner_id = u.id
        WHERE s.shared_with = ? AND f.is_trashed = 0
        ORDER BY s.created_at DESC`).all(userId);
    } else {
      // Normal folder view
      if (folder_id) {
        files = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
          LEFT JOIN users u ON f.owner_id = u.id
          WHERE f.folder_id = ? AND (f.owner_id = ? OR ? = 1) AND f.is_trashed = 0
          ORDER BY f.name ASC`).all(folder_id, userId, isAdmin ? 1 : 0);
      } else {
        files = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
          LEFT JOIN users u ON f.owner_id = u.id
          WHERE f.folder_id IS NULL AND (f.owner_id = ? OR ? = 1) AND f.is_trashed = 0
          ORDER BY f.name ASC`).all(userId, isAdmin ? 1 : 0);
      }
    }

    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/upload
router.post('/upload', requireRole('editor'), upload.array('files', 20), (req, res) => {
  try {
    const { folder_id } = req.body;
    const userId = req.user.id;
    const uploadedFiles = [];

    for (const file of req.files) {
      const id = uuidv4();
      const folderId = folder_id && folder_id !== 'null' ? folder_id : null;

      db.prepare(`INSERT INTO files (id, name, original_name, mimetype, size, storage_path, folder_id, owner_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, file.originalname, file.originalname, file.mimetype,
        file.size, file.filename, folderId, userId
      );

      // Update storage used
      db.prepare('UPDATE users SET storage_used = storage_used + ? WHERE id = ?').run(file.size, userId);

      const saved = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
      uploadedFiles.push(saved);
      logActivity(userId, req.user.name, 'uploaded', 'file', file.originalname);
    }

    res.status(201).json({ files: uploadedFiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:id/download
router.get('/:id/download', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (file.owner_id !== req.user.id && !isAdmin) {
      const share = db.prepare("SELECT id FROM shares WHERE resource_id = ? AND shared_with = ? AND resource_type = 'file'").get(file.id, req.user.id);
      if (!share) return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(uploadsDir, file.owner_id, file.storage_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    logActivity(req.user.id, req.user.name, 'downloaded', 'file', file.name);
    res.download(filePath, file.original_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:id/preview
router.get('/:id/preview', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (file.owner_id !== req.user.id && !isAdmin) {
      const share = db.prepare("SELECT id FROM shares WHERE resource_id = ? AND shared_with = ? AND resource_type = 'file'").get(file.id, req.user.id);
      if (!share) return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(uploadsDir, file.owner_id, file.storage_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

    res.setHeader('Content-Type', file.mimetype);
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:id
router.get('/:id', (req, res) => {
  try {
    const file = db.prepare(`SELECT f.*, u.name as owner_name FROM files f
      LEFT JOIN users u ON f.owner_id = u.id WHERE f.id = ?`).get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({ file });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/files/:id — rename
router.patch('/:id', requireRole('editor'), (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (file.owner_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE files SET name = ?, updated_at = unixepoch() WHERE id = ?').run(name.trim(), req.params.id);
    logActivity(req.user.id, req.user.name, 'renamed', 'file', name);

    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    res.json({ file: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/files/:id/star
router.patch('/:id/star', (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    db.prepare('UPDATE files SET is_starred = ?, updated_at = unixepoch() WHERE id = ?').run(file.is_starred ? 0 : 1, req.params.id);
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    res.json({ file: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/files/:id/trash
router.patch('/:id/trash', requireRole('editor'), (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (file.owner_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    db.prepare('UPDATE files SET is_trashed = ?, updated_at = unixepoch() WHERE id = ?').run(file.is_trashed ? 0 : 1, req.params.id);
    logActivity(req.user.id, req.user.name, file.is_trashed ? 'restored' : 'trashed', 'file', file.name);
    const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    res.json({ file: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/:id — permanent delete
router.delete('/:id', requireRole('editor'), (req, res) => {
  try {
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const isAdmin = req.user.role === 'super_admin';
    if (file.owner_id !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Access denied' });

    // Delete from disk
    const filePath = path.join(uploadsDir, file.owner_id, file.storage_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // Update storage
    db.prepare('UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?').run(file.size, file.owner_id);
    db.prepare('DELETE FROM shares WHERE resource_id = ? AND resource_type = ?').run(file.id, 'file');
    db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);

    logActivity(req.user.id, req.user.name, 'deleted', 'file', file.name);
    res.json({ message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/:id/share
router.post('/:id/share', requireRole('editor'), (req, res) => {
  try {
    const { shared_with_email, permission } = req.body;
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const sharedWith = db.prepare('SELECT id FROM users WHERE email = ?').get(shared_with_email?.toLowerCase().trim());
    if (!sharedWith) return res.status(404).json({ error: 'User not found' });

    // Upsert share
    const existing = db.prepare("SELECT id FROM shares WHERE resource_id = ? AND shared_with = ? AND resource_type = 'file'").get(file.id, sharedWith.id);
    if (existing) {
      db.prepare("UPDATE shares SET permission = ? WHERE id = ?").run(permission || 'view', existing.id);
    } else {
      db.prepare(`INSERT INTO shares (id, resource_type, resource_id, shared_by, shared_with, permission) VALUES (?, 'file', ?, ?, ?, ?)`)
        .run(uuidv4(), file.id, req.user.id, sharedWith.id, permission || 'view');
    }

    logActivity(req.user.id, req.user.name, 'shared', 'file', file.name, `Shared with ${shared_with_email}`);
    res.json({ message: 'File shared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
