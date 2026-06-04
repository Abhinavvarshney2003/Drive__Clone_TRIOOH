/**
 * testHelper.js
 * Builds a real (file-based) test SQLite database.
 * Each test suite gets its own DB file in /tmp so tests don't collide.
 *
 * APPROACH: We create the DB, seed it, and then REPLACE the `db` property
 * on the cached require('../db') module so all route files see the test DB.
 */

'use strict';

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Build a fully seeded in-memory test database.
 */
function buildTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Schema ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer', 'editor', 'super_admin')),
      storage_quota INTEGER NOT NULL DEFAULT 5368709120,
      storage_used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_active INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      village_id TEXT,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL CHECK(resource_type IN ('file', 'folder')),
      resource_id TEXT NOT NULL,
      shared_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_with TEXT REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL DEFAULT 'view' CHECK(permission IN ('view', 'edit')),
      token TEXT UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_name TEXT,
      details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(name, country_id)
    );

    CREATE TABLE IF NOT EXISTS cities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state_id TEXT NOT NULL REFERENCES states(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(name, state_id)
    );

    CREATE TABLE IF NOT EXISTS villages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city_id TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
      pincode TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(name, city_id)
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS user_villages (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      village_id TEXT NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, village_id)
    );
  `);

  // ── Seed users ────────────────────────────────────────────────────────────
  const adminId  = uuidv4();
  const editorId = uuidv4();
  const viewerId = uuidv4();

  db.prepare(`INSERT INTO users (id, name, email, password_hash, role, storage_quota) VALUES (?, ?, ?, ?, 'super_admin', 107374182400)`)
    .run(adminId,  'Super Admin',  'admin@drive.local',  bcrypt.hashSync('Admin@123',  10));
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'editor')`)
    .run(editorId, 'Demo Editor',  'editor@drive.local', bcrypt.hashSync('Editor@123', 10));
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'viewer')`)
    .run(viewerId, 'Demo Viewer',  'viewer@drive.local', bcrypt.hashSync('Viewer@123', 10));

  // ── Seed RBAC roles ───────────────────────────────────────────────────────
  const superAdminRoleId = uuidv4();
  const editorRoleId     = uuidv4();
  const viewerRoleId     = uuidv4();

  db.prepare('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)').run(superAdminRoleId, 'super_admin', 'Full access');
  db.prepare('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)').run(editorRoleId,     'editor',      'Edit access');
  db.prepare('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)').run(viewerRoleId,     'viewer',      'Read-only access');

  // ── Seed permissions ──────────────────────────────────────────────────────
  const readFilesId  = uuidv4();
  const writeFilesId = uuidv4();
  db.prepare('INSERT INTO permissions (id, name, description) VALUES (?, ?, ?)').run(readFilesId,  'read_files',  'Can read files');
  db.prepare('INSERT INTO permissions (id, name, description) VALUES (?, ?, ?)').run(writeFilesId, 'write_files', 'Can write files');

  db.prepare('INSERT INTO role_permissions VALUES (?, ?)').run(superAdminRoleId, readFilesId);
  db.prepare('INSERT INTO role_permissions VALUES (?, ?)').run(superAdminRoleId, writeFilesId);
  db.prepare('INSERT INTO role_permissions VALUES (?, ?)').run(editorRoleId,     readFilesId);
  db.prepare('INSERT INTO role_permissions VALUES (?, ?)').run(editorRoleId,     writeFilesId);
  db.prepare('INSERT INTO role_permissions VALUES (?, ?)').run(viewerRoleId,     readFilesId);

  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId,  superAdminRoleId);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(editorId, editorRoleId);
  db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(viewerId, viewerRoleId);

  // ── Seed location data ────────────────────────────────────────────────────
  const indiaId = uuidv4();
  const usaId   = uuidv4();
  db.prepare('INSERT INTO countries (id, name, code) VALUES (?, ?, ?)').run(indiaId, 'India',         'IN');
  db.prepare('INSERT INTO countries (id, name, code) VALUES (?, ?, ?)').run(usaId,   'United States', 'US');

  const mhId = uuidv4();
  const caId = uuidv4();
  db.prepare('INSERT INTO states (id, name, code, country_id) VALUES (?, ?, ?, ?)').run(mhId, 'Maharashtra', 'MH', indiaId);
  db.prepare('INSERT INTO states (id, name, code, country_id) VALUES (?, ?, ?, ?)').run(caId, 'California',  'CA', usaId);

  const mumbaiId = uuidv4();
  const laId     = uuidv4();
  db.prepare('INSERT INTO cities (id, name, state_id) VALUES (?, ?, ?)').run(mumbaiId, 'Mumbai',      mhId);
  db.prepare('INSERT INTO cities (id, name, state_id) VALUES (?, ?, ?)').run(laId,     'Los Angeles', caId);

  const dharaviId   = uuidv4();
  const hollywoodId = uuidv4();
  db.prepare('INSERT INTO villages (id, name, city_id, pincode) VALUES (?, ?, ?, ?)').run(dharaviId,   'Dharavi',   mumbaiId, '400017');
  db.prepare('INSERT INTO villages (id, name, city_id, pincode) VALUES (?, ?, ?, ?)').run(hollywoodId, 'Hollywood', laId,     '90028');

  return {
    db,
    adminId,
    editorId,
    viewerId,
    superAdminRoleId,
    editorRoleId,
    viewerRoleId,
    readFilesPermId: readFilesId,
    writeFilesPermId: writeFilesId,
    indiaId,
    usaId,
    mhStateId: mhId,
    caStateId: caId,
    mumbaiCityId: mumbaiId,
    laCityId: laId,
    dharaviVillageId: dharaviId,
    hollywoodVillageId: hollywoodId,
  };
}

/**
 * Inject a test DB into the already-loaded db module and return a cleanup fn.
 * Works by patching the module cache directly.
 */
function injectTestDb(testDb) {
  // The db module exports { db, initDb } — we need to replace 'db' property
  // on the actual exports object in the module cache.
  const dbModulePath = require.resolve('../db');
  const dbModule = require.cache[dbModulePath];
  if (dbModule && dbModule.exports) {
    const original = dbModule.exports.db;
    dbModule.exports.db = testDb;
    return () => { dbModule.exports.db = original; };
  }
  // Fallback: just require and patch
  const mod = require('../db');
  const orig = mod.db;
  mod.db = testDb;
  return () => { mod.db = orig; };
}

/**
 * Create a fresh Express app with a given test DB injected.
 * Jest module cache is cleared between test files via --runInBand + resetModules
 * in each test file's beforeAll.
 */
function createTestApp(testDbInstance) {
  // First load the db module so it's in cache
  const dbMod = require('../db');
  const originalDb = dbMod.db;
  // Swap in test db
  dbMod.db = testDbInstance;

  // Now load server (which requires db)
  const app = require('../server');

  // Return cleanup
  const cleanup = () => { dbMod.db = originalDb; };
  return { app, cleanup };
}

module.exports = { buildTestDb, injectTestDb, createTestApp };
