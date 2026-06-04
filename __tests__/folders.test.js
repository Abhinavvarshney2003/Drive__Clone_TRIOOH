'use strict';

/**
 * folders.test.js
 * Tests: create folder, list folders, rename, delete, permissions check
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { buildTestDb, mockDb } = require('./testHelper');

let app;
let restore;
let ctx;

beforeAll(() => {
  ctx = buildTestDb();
  restore = mockDb(ctx.db);
  jest.resetModules();
  app = require('../server');
});

afterAll(() => {
  restore();
  if (ctx.db && ctx.db.open) ctx.db.close();
});

async function login(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

let adminToken, editorToken, viewerToken;
let createdFolderId;

beforeAll(async () => {
  adminToken  = await login('admin@drive.local',  'Admin@123');
  editorToken = await login('editor@drive.local', 'Editor@123');
  viewerToken = await login('viewer@drive.local', 'Viewer@123');
});

// ─── Create folder ────────────────────────────────────────────────────────────

describe('POST /api/folders', () => {
  it('editor can create a root folder', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Test Folder' });

    expect(res.status).toBe(201);
    expect(res.body.folder.name).toBe('Test Folder');
    createdFolderId = res.body.folder.id;
  });

  it('admin can create a root folder', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Root Folder' });

    expect(res.status).toBe(201);
    expect(res.body.folder.name).toBe('Admin Root Folder');
  });

  it('viewer cannot create folder (403)', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Should Fail' });

    expect(res.status).toBe(403);
  });

  it('returns 400 if name is missing', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/api/folders')
      .send({ name: 'Unauth' });

    expect(res.status).toBe(401);
  });

  it('can create a nested folder inside another', async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Nested Folder', parent_id: createdFolderId });

    expect(res.status).toBe(201);
    expect(res.body.folder.parent_id).toBe(createdFolderId);
  });
});

// ─── List folders ─────────────────────────────────────────────────────────────

describe('GET /api/folders', () => {
  it('authenticated user can list root folders', async () => {
    const res = await request(app)
      .get('/api/folders')
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('folders');
    expect(Array.isArray(res.body.folders)).toBe(true);
  });

  it('viewer can list folders', async () => {
    const res = await request(app)
      .get('/api/folders')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('folders');
  });

  it('admin can list all folders', async () => {
    const res = await request(app)
      .get('/api/folders')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.folders.length).toBeGreaterThan(0);
  });

  it('can list folders within a parent', async () => {
    const res = await request(app)
      .get(`/api/folders?parent_id=${createdFolderId}`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.folders)).toBe(true);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/folders');
    expect(res.status).toBe(401);
  });
});

// ─── Rename folder ────────────────────────────────────────────────────────────

describe('PATCH /api/folders/:id (rename)', () => {
  it('editor can rename their folder', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Renamed Folder' });

    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe('Renamed Folder');
  });

  it('admin can rename any folder', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.folder.name).toBe('Admin Renamed');
  });

  it('returns 400 if name is missing', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent folder', async () => {
    const res = await request(app)
      .patch('/api/folders/no-such-folder')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('viewer cannot rename folder', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Viewer Try' });

    expect(res.status).toBe(403);
  });
});

// ─── Star/Trash ───────────────────────────────────────────────────────────────

describe('PATCH /api/folders/:id/star', () => {
  it('user can toggle star on a folder', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}/star`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect([0, 1]).toContain(res.body.folder.is_starred);
  });
});

describe('PATCH /api/folders/:id/trash', () => {
  it('editor can trash their folder', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}/trash`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect([0, 1]).toContain(res.body.folder.is_trashed);
  });

  it('viewer cannot trash folders', async () => {
    const res = await request(app)
      .patch(`/api/folders/${createdFolderId}/trash`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── Folder path ──────────────────────────────────────────────────────────────

describe('GET /api/folders/:id/path', () => {
  it('can get breadcrumb path', async () => {
    const res = await request(app)
      .get(`/api/folders/${createdFolderId}/path`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('path');
    expect(Array.isArray(res.body.path)).toBe(true);
  });
});

// ─── Delete folder ────────────────────────────────────────────────────────────

describe('DELETE /api/folders/:id', () => {
  let folderToDeleteId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Delete Me' });
    folderToDeleteId = res.body.folder.id;
  });

  it('admin can delete a folder', async () => {
    const res = await request(app)
      .delete(`/api/folders/${folderToDeleteId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('returns 404 for non-existent folder', async () => {
    const res = await request(app)
      .delete('/api/folders/ghost-folder')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('viewer cannot delete folder', async () => {
    const res = await request(app)
      .delete(`/api/folders/${createdFolderId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });

  it('editor cannot delete another user\'s folder', async () => {
    // Create a folder as admin
    const createRes = await request(app)
      .post('/api/folders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Only Folder' });

    const fid = createRes.body.folder.id;

    const res = await request(app)
      .delete(`/api/folders/${fid}`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(403);
  });
});
