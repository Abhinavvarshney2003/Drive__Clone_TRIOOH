'use strict';

/**
 * auth.test.js
 * Tests: POST /api/auth/login, POST /api/auth/register, GET /api/auth/me
 */

process.env.NODE_ENV = 'test';

const request = require('supertest');
const { buildTestDb, mockDb } = require('./testHelper');

let app;
let restore;
let testDb;

beforeAll(() => {
  testDb = buildTestDb();
  restore = mockDb(testDb.db);
  // Load app after mocking db
  jest.resetModules();
  // Re-require with fresh module cache after mock is in place
  app = require('../server');
});

afterAll(() => {
  restore();
  if (testDb.db && testDb.db.open) testDb.db.close();
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('should login with valid admin credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drive.local', password: 'Admin@123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toMatchObject({
      email: 'admin@drive.local',
      role: 'super_admin',
    });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should login with valid editor credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'editor@drive.local', password: 'Editor@123' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('editor');
  });

  it('should return 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drive.local', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should return 401 for non-existent user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@drive.local', password: 'whatever' });

    expect(res.status).toBe(401);
  });

  it('should return 400 if email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Admin@123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('should return 400 if password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drive.local' });

    expect(res.status).toBe(400);
  });

  it('should return 400 if both fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── Register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'testuser@drive.local', password: 'Test@1234' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.email).toBe('testuser@drive.local');
    expect(res.body.user.role).toBe('viewer');
  });

  it('should return 409 if email already registered', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup User', email: 'admin@drive.local', password: 'Admin@123' });

    expect(res.status).toBe(409);
  });

  it('should return 400 if name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@drive.local', password: 'Test@1234' });

    expect(res.status).toBe(400);
  });

  it('should return 400 if password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short Pass', email: 'shortpass@drive.local', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  it('should return 400 if all fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── Auth/Me ──────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drive.local', password: 'Admin@123' });
    adminToken = res.body.accessToken;
  });

  it('should return current user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@drive.local');
  });

  it('should return 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer totally.invalid.token');
    expect(res.status).toBe(401);
  });

  it('should return 401 with a malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'notbearer something');
    expect(res.status).toBe(401);
  });
});

// ─── Refresh token ────────────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  let refreshToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@drive.local', password: 'Admin@123' });
    refreshToken = res.body.refreshToken;
  });

  it('should return a new access token with valid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('should return 400 if refresh token is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('should return 401 with invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad.token.here' });
    expect(res.status).toBe(401);
  });
});
