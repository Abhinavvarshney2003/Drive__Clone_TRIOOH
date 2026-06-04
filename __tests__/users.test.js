'use strict';

/**
 * users.test.js
 * Tests: admin-only access, create/update/delete user, assign role
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

// Helper: login and get token
async function login(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.accessToken;
}

let adminToken, editorToken, viewerToken;

beforeAll(async () => {
  adminToken  = await login('admin@drive.local',  'Admin@123');
  editorToken = await login('editor@drive.local', 'Editor@123');
  viewerToken = await login('viewer@drive.local', 'Viewer@123');
});

// ─── Admin-only access ────────────────────────────────────────────────────────

describe('GET /api/users — admin-only access', () => {
  it('admin can list all users', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(3);
  });

  it('editor cannot list users (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(403);
  });

  it('viewer cannot list users (403)', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/users/stats ─────────────────────────────────────────────────────

describe('GET /api/users/stats', () => {
  it('admin can get stats', async () => {
    const res = await request(app)
      .get('/api/users/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('totalFiles');
    expect(res.body).toHaveProperty('totalFolders');
    expect(res.body).toHaveProperty('byRole');
    expect(res.body).toHaveProperty('recentActivity');
  });

  it('non-admin cannot get stats', async () => {
    const res = await request(app)
      .get('/api/users/stats')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/users/activity ──────────────────────────────────────────────────

describe('GET /api/users/activity', () => {
  it('admin can get activity log', async () => {
    const res = await request(app)
      .get('/api/users/activity')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activity');
    expect(Array.isArray(res.body.activity)).toBe(true);
  });

  it('non-admin cannot access activity log', async () => {
    const res = await request(app)
      .get('/api/users/activity')
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── Create user ──────────────────────────────────────────────────────────────

describe('POST /api/users', () => {
  it('admin can create a new user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New User', email: 'newuser@drive.local', password: 'New@1234', role: 'viewer' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('newuser@drive.local');
    expect(res.body.user.role).toBe('viewer');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns 409 if email already exists', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup', email: 'editor@drive.local', password: 'Test@1234' });

    expect(res.status).toBe(409);
  });

  it('returns 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'incomplete@drive.local' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad Role', email: 'badrole@drive.local', password: 'Test@1234', role: 'hacker' });

    expect(res.status).toBe(400);
  });

  it('non-admin cannot create user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'X', email: 'x@drive.local', password: 'Test@1234' });

    expect(res.status).toBe(403);
  });
});

// ─── Update user ──────────────────────────────────────────────────────────────

describe('PATCH /api/users/:id', () => {
  it('admin can update user name', async () => {
    const res = await request(app)
      .patch(`/api/users/${ctx.viewerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Viewer Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Viewer Name');
  });

  it('admin can change user role', async () => {
    const res = await request(app)
      .patch(`/api/users/${ctx.viewerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'editor' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('editor');
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .patch('/api/users/nonexistentid')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Ghost' });

    expect(res.status).toBe(404);
  });

  it('returns 400 if nothing to update', async () => {
    const res = await request(app)
      .patch(`/api/users/${ctx.viewerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── Delete user ──────────────────────────────────────────────────────────────

describe('DELETE /api/users/:id', () => {
  it('admin cannot delete themselves', async () => {
    const res = await request(app)
      .delete(`/api/users/${ctx.adminId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .delete('/api/users/ghost-id-123')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('admin can delete another user', async () => {
    // First create a user to delete
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'To Delete', email: 'todelete@drive.local', password: 'Delete@123' });

    const userId = createRes.body.user.id;

    const deleteRes = await request(app)
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toMatch(/deleted/i);
  });
});

// ─── Assign role ──────────────────────────────────────────────────────────────

describe('POST /api/users/:id/assign-role', () => {
  it('admin can assign a role to a user', async () => {
    const res = await request(app)
      .post(`/api/users/${ctx.viewerId}/assign-role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role_id: ctx.editorRoleId });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/assigned/i);
    expect(res.body.user.roles.some(r => r.id === ctx.editorRoleId)).toBe(true);
  });

  it('returns 400 if role_id is missing', async () => {
    const res = await request(app)
      .post(`/api/users/${ctx.viewerId}/assign-role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent role', async () => {
    const res = await request(app)
      .post(`/api/users/${ctx.viewerId}/assign-role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role_id: 'ghost-role-id' });

    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/users/ghost-user/assign-role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role_id: ctx.editorRoleId });

    expect(res.status).toBe(404);
  });

  it('non-admin cannot assign roles', async () => {
    const res = await request(app)
      .post(`/api/users/${ctx.viewerId}/assign-role`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ role_id: ctx.editorRoleId });

    expect(res.status).toBe(403);
  });
});
