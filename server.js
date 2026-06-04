import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import db from './db.js';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

// ── Config ──────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const fallback = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  WARNING: JWT_SECRET not set in environment. Using random secret — tokens will be invalidated on restart!');
  return fallback;
})();

const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '10', 10);
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : (NODE_ENV === 'production' ? [] : [true]);

// ── Security Middleware ─────────────────────────────────────────────────────
// Security headers (lightweight helmet replacement — no extra dependency)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Helper to extract hostname from a URL string
const getHostname = (urlStr) => {
  try {
    return new URL(urlStr).hostname;
  } catch (e) {
    return urlStr;
  }
};

// CORS — dynamic configuration to handle port changes and prevent server-side errors on blocked origins
app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  let allowed = false;

  if (!origin) {
    allowed = true;
  } else {
    const originHost = getHostname(origin);
    const reqHost = getHostname(`${req.protocol}://${req.get('host')}`);
    const allowedHosts = ALLOWED_ORIGINS.map(o => getHostname(o));

    if (
      originHost === reqHost || 
      allowedHosts.includes(originHost) || 
      ALLOWED_ORIGINS.includes(true)
    ) {
      allowed = true;
    }
  }

  callback(null, {
    origin: allowed ? origin : false,
    credentials: true,
  });
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── Request Logging ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 400) {
      console.error(log);
    } else if (NODE_ENV !== 'production' || req.originalUrl.startsWith('/api/')) {
      console.log(log);
    }
  });
  next();
});

// ── Rate Limiter (login endpoint) ───────────────────────────────────────────
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

function loginRateLimiter(req, res, next) {
  const key = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (entry) {
    // Clean expired entries
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
      loginAttempts.set(key, { windowStart: now, count: 1 });
    } else if (entry.count >= RATE_LIMIT_MAX) {
      const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message: `Too many login attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      });
    } else {
      entry.count++;
    }
  } else {
    loginAttempts.set(key, { windowStart: now, count: 1 });
  }
  next();
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) loginAttempts.delete(key);
  }
}, 60 * 1000);

// ── Database Seed ───────────────────────────────────────────────────────────
const initDb = async () => {
  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', ['admin@drive.local']);
    if (users.length === 0) {
      const hash = await bcrypt.hash('Admin@123', 10);
      await db.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        ['Super Admin', 'admin@drive.local', hash, 'super_admin']
      );
      console.log('🔑 Default admin created: admin@drive.local / Admin@123');
      console.log('⚠️  IMPORTANT: Change the default admin password after first login!');
    }

    const [countries] = await db.query('SELECT COUNT(*) as c FROM countries');
    if (countries[0].c === 0) {
      const [infoC] = await db.query('INSERT INTO countries (name, code) VALUES (?, ?)', ['India', 'IN']);
      const [infoS] = await db.query('INSERT INTO states (name, country_id) VALUES (?, ?)', ['Rajasthan', infoC.insertId]);
      const [infoCity] = await db.query('INSERT INTO cities (name, state_id) VALUES (?, ?)', ['Jaipur', infoS.insertId]);
      await db.query('INSERT INTO villages (name, city_id) VALUES (?, ?)', ['Kaladera', infoCity.insertId]);
      await db.query('INSERT INTO villages (name, city_id) VALUES (?, ?)', ['Chomu', infoCity.insertId]);
      console.log('🌱 Location seed data populated.');
    }
  } catch (err) {
    console.error('⚠️  DB Seeding skipped or tables not ready yet:', err.message);
  }
};
setTimeout(initDb, 1500);

// ── Auth Middleware ─────────────────────────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies.access_token;
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const [rows] = await db.query('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    req.user = rows[0] || null;
    if (!req.user) return res.status(401).json({ success: false, message: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Forbidden' });
  next();
};

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ success: false, status: 'unhealthy', message: 'Database unavailable' });
  }
});

// ── AUTH & USERS ────────────────────────────────────────────────────────────
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('access_token', token, {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });
    res.json({
      success: true,
      data: {
        access_token: token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('access_token');
  res.json({ success: true, message: 'Logged out' });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ success: true, data: req.user }));

app.get('/api/auth/roles-permissions', auth, (req, res) => {
  res.json({
    success: true,
    data: {
      roles: [req.user.role],
      permissions: req.user.role === 'super_admin' 
        ? ['admin', 'edit', 'upload', 'delete'] 
        : (req.user.role === 'editor' ? ['edit', 'upload', 'delete'] : []),
    }
  });
});

app.get('/api/users', auth, adminAuth, async (req, res) => {
  try {
    const [users] = await db.query('SELECT id, name, email, role, created_at FROM users');
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/users/:id/role', auth, adminAuth, async (req, res) => {
  const { role } = req.body;
  const validRoles = ['viewer', 'editor', 'super_admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }
  try {
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ success: true, message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/users', auth, adminAuth, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
  }
  const validRoles = ['viewer', 'editor', 'super_admin'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hash, role || 'viewer']);
    res.json({ success: true, message: 'User created' });
  } catch (e) {
    res.status(400).json({ success: false, message: 'Email already exists' });
  }
});

// ── LOCATIONS ───────────────────────────────────────────────────────────────
const VALID_LOCATION_TABLES = ['countries', 'states', 'cities', 'villages'];

app.get('/api/locations/countries', auth, async (req, res) => {
  try {
    const [countries] = await db.query('SELECT * FROM countries ORDER BY name ASC');
    res.json({ success: true, data: countries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/locations/states', auth, async (req, res) => {
  try {
    const [states] = req.query.country_id
      ? await db.query('SELECT * FROM states WHERE country_id = ? ORDER BY name ASC', [req.query.country_id])
      : await db.query('SELECT * FROM states ORDER BY name ASC');
    res.json({ success: true, data: states });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/locations/cities', auth, async (req, res) => {
  try {
    const [cities] = req.query.state_id
      ? await db.query('SELECT * FROM cities WHERE state_id = ? ORDER BY name ASC', [req.query.state_id])
      : await db.query('SELECT * FROM cities ORDER BY name ASC');
    res.json({ success: true, data: cities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/locations/villages', auth, async (req, res) => {
  try {
    const [villages] = req.query.city_id
      ? await db.query('SELECT * FROM villages WHERE city_id = ? ORDER BY name ASC', [req.query.city_id])
      : await db.query('SELECT * FROM villages ORDER BY name ASC');
    res.json({ success: true, data: villages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/locations/:type', auth, adminAuth, async (req, res) => {
  const { type } = req.params;
  const { name, parent_id, code } = req.body;

  // Validate table name to prevent SQL injection
  if (!VALID_LOCATION_TABLES.includes(type)) {
    return res.status(400).json({ success: false, message: `Invalid location type. Must be one of: ${VALID_LOCATION_TABLES.join(', ')}` });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }

  try {
    if (type === 'countries') await db.query('INSERT INTO countries (name, code) VALUES (?, ?)', [name, code]);
    if (type === 'states') await db.query('INSERT INTO states (name, country_id) VALUES (?, ?)', [name, parent_id]);
    if (type === 'cities') await db.query('INSERT INTO cities (name, state_id) VALUES (?, ?)', [name, parent_id]);
    if (type === 'villages') await db.query('INSERT INTO villages (name, city_id) VALUES (?, ?)', [name, parent_id]);
    res.json({ success: true, message: 'Created' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

app.delete('/api/locations/:type/:id', auth, adminAuth, async (req, res) => {
  const { type, id } = req.params;

  // Validate table name to prevent SQL injection
  if (!VALID_LOCATION_TABLES.includes(type)) {
    return res.status(400).json({ success: false, message: `Invalid location type. Must be one of: ${VALID_LOCATION_TABLES.join(', ')}` });
  }

  try {
    await db.query(`DELETE FROM ${type} WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── DRIVE (Folders) ─────────────────────────────────────────────────────────
app.get('/api/folders', auth, async (req, res) => {
  const { village_id } = req.query;
  try {
    const [folders] = village_id
      ? await db.query('SELECT * FROM folders WHERE village_id = ? ORDER BY name ASC', [village_id])
      : await db.query('SELECT * FROM folders ORDER BY name ASC');
    res.json({ success: true, data: folders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/folders', auth, async (req, res) => {
  const { name, village_id, parent_id } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Folder name is required' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO folders (name, village_id, parent_id) VALUES (?, ?, ?)',
      [name, village_id, parent_id || null]
    );
    const [rows] = await db.query('SELECT * FROM folders WHERE id = ?', [result.insertId]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/folders/:id', auth, async (req, res) => {
  if (!req.body.name || !req.body.name.trim()) {
    return res.status(400).json({ success: false, message: 'Folder name is required' });
  }
  try {
    await db.query('UPDATE folders SET name = ? WHERE id = ?', [req.body.name, req.params.id]);
    res.json({ success: true, message: 'Updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/folders/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM folders WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DRIVE (Images / Upload) ─────────────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'];

// Multer in-memory storage to prevent writing uploaded files to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only images are allowed.`), false);
    }
  },
});

app.get('/api/images', auth, async (req, res) => {
  const { folder_id, village_id } = req.query;
  let images = [];
  try {
    if (folder_id) {
      const [rows] = await db.query(
        'SELECT id, name, original_name, size, folder_id, village_id, created_at FROM images WHERE folder_id = ? ORDER BY created_at DESC',
        [folder_id]
      );
      images = rows;
    } else if (village_id) {
      const [rows] = await db.query(
        'SELECT id, name, original_name, size, folder_id, village_id, created_at FROM images WHERE folder_id IS NULL AND village_id = ? ORDER BY created_at DESC',
        [village_id]
      );
      images = rows;
    } else {
      const [rows] = await db.query(
        'SELECT id, name, original_name, size, folder_id, village_id, created_at FROM images WHERE folder_id IS NULL AND village_id IS NULL ORDER BY created_at DESC'
      );
      images = rows;
    }
    const baseUrl = `${req.protocol}://${req.get('host')}/api/images/`;
    res.json({ success: true, data: images.map(img => ({ ...img, path: `${baseUrl}${img.id}/view` })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// View image directly from MySQL LONGBLOB
app.get('/api/images/:id/view', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT mime_type, data FROM images WHERE id = ?', [req.params.id]);
    const img = rows[0];
    if (!img || !img.data) {
      return res.status(404).send('Image not found');
    }
    res.setHeader('Content-Type', img.mime_type);
    res.send(img.data);
  } catch (err) {
    console.error('Error serving image BLOB:', err.message);
    res.status(500).send('Error loading image');
  }
});

app.post('/api/images/upload', auth, upload.array('images[]', 20), async (req, res) => {
  const { folder_id, village_id } = req.body;
  const results = [];
  try {
    for (const file of req.files) {
      const [insertResult] = await db.query(
        'INSERT INTO images (name, original_name, mime_type, data, size, folder_id, village_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [file.originalname, file.originalname, file.mimetype, file.buffer, file.size, folder_id || null, village_id || null]
      );
      const [rows] = await db.query(
        'SELECT id, name, original_name, size, folder_id, village_id, created_at FROM images WHERE id = ?',
        [insertResult.insertId]
      );
      results.push(rows[0]);
    }
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// Bulk upload endpoint with dynamic database folder structure creation
app.post('/api/images/upload-bulk', auth, upload.single('image'), async (req, res) => {
  const { state_id, city_id, city_name, village_id, village_name, folder_id, folder_names } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: 'No image file provided' });
  }
  if (!state_id) {
    return res.status(400).json({ success: false, message: 'state_id is required' });
  }

  try {
    let resolvedCityId = city_id ? parseInt(city_id, 10) : null;
    let resolvedVillageId = village_id ? parseInt(village_id, 10) : null;
    let resolvedFolderId = null;

    // 1. Resolve City
    if (!resolvedCityId && city_name && city_name.trim() && state_id) {
      const trimmedCity = city_name.trim();
      const stateIdInt = parseInt(state_id, 10);
      const [cities] = await db.query(
        'SELECT id FROM cities WHERE LOWER(name) = LOWER(?) AND state_id = ?',
        [trimmedCity, stateIdInt]
      );
      if (cities.length > 0) {
        resolvedCityId = cities[0].id;
      } else {
        try {
          const [insertRes] = await db.query(
            'INSERT INTO cities (name, state_id) VALUES (?, ?)',
            [trimmedCity, stateIdInt]
          );
          resolvedCityId = insertRes.insertId;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            const [citiesRetry] = await db.query(
              'SELECT id FROM cities WHERE LOWER(name) = LOWER(?) AND state_id = ?',
              [trimmedCity, stateIdInt]
            );
            resolvedCityId = citiesRetry[0].id;
          } else {
            throw err;
          }
        }
      }
    }

    // 2. Resolve Village
    let finalVillageName = village_name;
    if (!resolvedVillageId && (!finalVillageName || !finalVillageName.trim()) && resolvedCityId) {
      const [cityRow] = await db.query('SELECT name FROM cities WHERE id = ?', [resolvedCityId]);
      if (cityRow.length > 0) {
        finalVillageName = cityRow[0].name + ' (Town)';
      } else {
        finalVillageName = 'Default Village';
      }
    }

    if (!resolvedVillageId && finalVillageName && finalVillageName.trim() && resolvedCityId) {
      const trimmedVillage = finalVillageName.trim();
      const [villages] = await db.query(
        'SELECT id FROM villages WHERE LOWER(name) = LOWER(?) AND city_id = ?',
        [trimmedVillage, resolvedCityId]
      );
      if (villages.length > 0) {
        resolvedVillageId = villages[0].id;
      } else {
        try {
          const [insertRes] = await db.query(
            'INSERT INTO villages (name, city_id) VALUES (?, ?)',
            [trimmedVillage, resolvedCityId]
          );
          resolvedVillageId = insertRes.insertId;
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            const [villagesRetry] = await db.query(
              'SELECT id FROM villages WHERE LOWER(name) = LOWER(?) AND city_id = ?',
              [trimmedVillage, resolvedCityId]
            );
            resolvedVillageId = villagesRetry[0].id;
          } else {
            throw err;
          }
        }
      }
    } else if (finalVillageName && finalVillageName.trim() && !resolvedCityId && !resolvedVillageId) {
      return res.status(400).json({ success: false, message: 'City context is missing or could not be resolved for the village' });
    }

    // 3. Resolve Folder path recursively under the Village
    if (folder_id) {
      resolvedFolderId = parseInt(folder_id, 10);
    } else {
      let folderNamesList = [];
      if (folder_names) {
        try {
          folderNamesList = typeof folder_names === 'string' ? JSON.parse(folder_names) : folder_names;
        } catch (e) {
          console.error('Failed to parse folder_names:', e);
        }
      }

      if (resolvedVillageId && Array.isArray(folderNamesList) && folderNamesList.length > 0) {
        let currentParentId = null;
        for (const fName of folderNamesList) {
          const trimmedFolder = fName.trim();
          if (!trimmedFolder) continue;
          const [folders] = await db.query(
            'SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND village_id = ? AND ' +
            (currentParentId ? 'parent_id = ?' : 'parent_id IS NULL'),
            currentParentId ? [trimmedFolder, resolvedVillageId, currentParentId] : [trimmedFolder, resolvedVillageId]
          );
          if (folders.length > 0) {
            currentParentId = folders[0].id;
          } else {
            try {
              const [insertRes] = await db.query(
                'INSERT INTO folders (name, village_id, parent_id) VALUES (?, ?, ?)',
                [trimmedFolder, resolvedVillageId, currentParentId]
              );
              currentParentId = insertRes.insertId;
            } catch (err) {
              if (err.code === 'ER_DUP_ENTRY') {
                const [foldersRetry] = await db.query(
                  'SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND village_id = ? AND ' +
                  (currentParentId ? 'parent_id = ?' : 'parent_id IS NULL'),
                  currentParentId ? [trimmedFolder, resolvedVillageId, currentParentId] : [trimmedFolder, resolvedVillageId]
                );
                currentParentId = foldersRetry[0].id;
              } else {
                throw err;
              }
            }
          }
        }
        resolvedFolderId = currentParentId;
      }
    }

    // 4. Insert Image
    const [insertResult] = await db.query(
      'INSERT INTO images (name, original_name, mime_type, data, size, folder_id, village_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [file.originalname, file.originalname, file.mimetype, file.buffer, file.size, resolvedFolderId || null, resolvedVillageId || null]
    );

    const [rows] = await db.query(
      'SELECT id, name, original_name, size, folder_id, village_id, created_at FROM images WHERE id = ?',
      [insertResult.insertId]
    );

    res.json({
      success: true,
      data: {
        image: rows[0],
        resolvedCityId,
        resolvedVillageId,
        resolvedFolderId
      }
    });
  } catch (err) {
    console.error('Error in upload-bulk:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/images/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM images WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Deleted' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// ── Serve Frontend (production) ─────────────────────────────────────────────
let frontendDist = path.join(__dirname, 'frontend/dist'); // 1. Nested compiled dist (for full-source uploads)
if (!fs.existsSync(frontendDist)) {
  frontendDist = path.join(__dirname, 'frontend'); // 2. Flat deployment (for deploy.sh uploads)
}
if (!fs.existsSync(frontendDist)) {
  frontendDist = path.join(__dirname, '../frontend/dist'); // 3. Local/standard structure
}

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    } else {
      res.status(404).json({ success: false, message: 'Not found' });
    }
  });
}

// ── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: `File too large. Maximum size is ${MAX_UPLOAD_MB}MB.` });
  }
  // Multer file type error
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(415).json({ success: false, message: err.message });
  }

  console.error(`[ERROR] ${new Date().toISOString()} ${req.method} ${req.originalUrl}:`, err.message);
  res.status(500).json({
    success: false,
    message: NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start Server ────────────────────────────────────────────────────────────
const port = process.env.SERVER_PORT || process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`\n🚀 DGDrive Backend v1.0.0 (MySQL & BLOB Mode)`);
  console.log(`   Environment: ${NODE_ENV}`);
  console.log(`   Port:        ${port}`);
  console.log(`   CORS Origin: ${ALLOWED_ORIGINS.includes(true) ? 'ALL (development)' : ALLOWED_ORIGINS.join(', ')}`);
  console.log(`   Frontend:    ${fs.existsSync(frontendDist) ? frontendDist : 'Not found'}\n`);
});

// ── Graceful Shutdown ───────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n⏳ ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    try { db.end(); } catch (e) { /* ignore */ }
    console.log('✅ Server stopped cleanly.');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
