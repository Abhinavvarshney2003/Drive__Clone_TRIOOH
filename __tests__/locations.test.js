'use strict';

/**
 * locations.test.js
 * Tests: CRUD for countries, states, cities, villages
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

beforeAll(async () => {
  adminToken  = await login('admin@drive.local',  'Admin@123');
  editorToken = await login('editor@drive.local', 'Editor@123');
  viewerToken = await login('viewer@drive.local', 'Viewer@123');
});

// ─── COUNTRIES ────────────────────────────────────────────────────────────────

describe('Countries', () => {
  let newCountryId;

  it('GET /api/locations/countries — returns seeded countries', async () => {
    const res = await request(app)
      .get('/api/locations/countries')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('countries');
    expect(res.body.countries.length).toBeGreaterThanOrEqual(2);
    const names = res.body.countries.map(c => c.name);
    expect(names).toContain('India');
    expect(names).toContain('United States');
  });

  it('GET /api/locations/countries/:id — returns a single country', async () => {
    const res = await request(app)
      .get(`/api/locations/countries/${ctx.indiaId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.country.name).toBe('India');
    expect(res.body.country.code).toBe('IN');
  });

  it('GET /api/locations/countries/:id — 404 for unknown', async () => {
    const res = await request(app)
      .get('/api/locations/countries/ghost-country')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(404);
  });

  it('POST /api/locations/countries — editor can create country', async () => {
    const res = await request(app)
      .post('/api/locations/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Germany', code: 'DE' });

    expect(res.status).toBe(201);
    expect(res.body.country.name).toBe('Germany');
    expect(res.body.country.code).toBe('DE');
    newCountryId = res.body.country.id;
  });

  it('POST /api/locations/countries — 400 if name or code missing', async () => {
    const res = await request(app)
      .post('/api/locations/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'France' });

    expect(res.status).toBe(400);
  });

  it('POST /api/locations/countries — 409 for duplicate', async () => {
    const res = await request(app)
      .post('/api/locations/countries')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'India', code: 'INN' });

    expect(res.status).toBe(409);
  });

  it('viewer cannot create country (403)', async () => {
    const res = await request(app)
      .post('/api/locations/countries')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Japan', code: 'JP' });

    expect(res.status).toBe(403);
  });

  it('PUT /api/locations/countries/:id — editor can update', async () => {
    const res = await request(app)
      .put(`/api/locations/countries/${newCountryId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Deutschland' });

    expect(res.status).toBe(200);
    expect(res.body.country.name).toBe('Deutschland');
  });

  it('PUT /api/locations/countries/:id — 404 for unknown', async () => {
    const res = await request(app)
      .put('/api/locations/countries/ghost')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  it('DELETE /api/locations/countries/:id — admin can delete', async () => {
    const res = await request(app)
      .delete(`/api/locations/countries/${newCountryId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('DELETE /api/locations/countries/:id — editor cannot delete (403)', async () => {
    const res = await request(app)
      .delete(`/api/locations/countries/${ctx.usaId}`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── STATES ───────────────────────────────────────────────────────────────────

describe('States', () => {
  let newStateId;

  it('GET /api/locations/states — returns all states', async () => {
    const res = await request(app)
      .get('/api/locations/states')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.states.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/locations/states?country_id= — filters by country', async () => {
    const res = await request(app)
      .get(`/api/locations/states?country_id=${ctx.indiaId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.states.every(s => s.country_id === ctx.indiaId || s.country_name === 'India')).toBe(true);
  });

  it('GET /api/locations/states/:id — returns single state', async () => {
    const res = await request(app)
      .get(`/api/locations/states/${ctx.mhStateId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.state.name).toBe('Maharashtra');
  });

  it('GET /api/locations/states/:id — 404 for unknown', async () => {
    const res = await request(app)
      .get('/api/locations/states/ghost')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(404);
  });

  it('POST /api/locations/states — editor can create state', async () => {
    const res = await request(app)
      .post('/api/locations/states')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Rajasthan', code: 'RJ', country_id: ctx.indiaId });

    expect(res.status).toBe(201);
    expect(res.body.state.name).toBe('Rajasthan');
    newStateId = res.body.state.id;
  });

  it('POST /api/locations/states — 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/api/locations/states')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'X' });

    expect(res.status).toBe(400);
  });

  it('POST /api/locations/states — 404 if country not found', async () => {
    const res = await request(app)
      .post('/api/locations/states')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Nowhere', code: 'NW', country_id: 'ghost-country' });

    expect(res.status).toBe(404);
  });

  it('PUT /api/locations/states/:id — editor can update', async () => {
    const res = await request(app)
      .put(`/api/locations/states/${newStateId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Rajasthan Updated' });

    expect(res.status).toBe(200);
    expect(res.body.state.name).toBe('Rajasthan Updated');
  });

  it('DELETE /api/locations/states/:id — admin can delete', async () => {
    const res = await request(app)
      .delete(`/api/locations/states/${newStateId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// ─── CITIES ───────────────────────────────────────────────────────────────────

describe('Cities', () => {
  let newCityId;

  it('GET /api/locations/cities — returns all cities', async () => {
    const res = await request(app)
      .get('/api/locations/cities')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cities.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/locations/cities?state_id= — filters by state', async () => {
    const res = await request(app)
      .get(`/api/locations/cities?state_id=${ctx.mhStateId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cities.length).toBeGreaterThanOrEqual(1);
    expect(res.body.cities[0].state_name).toBe('Maharashtra');
  });

  it('GET /api/locations/cities/:id — returns city with context', async () => {
    const res = await request(app)
      .get(`/api/locations/cities/${ctx.mumbaiCityId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.city.name).toBe('Mumbai');
    expect(res.body.city.state_name).toBe('Maharashtra');
    expect(res.body.city.country_name).toBe('India');
  });

  it('POST /api/locations/cities — editor can create city', async () => {
    const res = await request(app)
      .post('/api/locations/cities')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Nashik', state_id: ctx.mhStateId });

    expect(res.status).toBe(201);
    expect(res.body.city.name).toBe('Nashik');
    newCityId = res.body.city.id;
  });

  it('POST /api/locations/cities — 409 for duplicate', async () => {
    const res = await request(app)
      .post('/api/locations/cities')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Mumbai', state_id: ctx.mhStateId });

    expect(res.status).toBe(409);
  });

  it('POST /api/locations/cities — 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/api/locations/cities')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'NoState' });

    expect(res.status).toBe(400);
  });

  it('PUT /api/locations/cities/:id — editor can update', async () => {
    const res = await request(app)
      .put(`/api/locations/cities/${newCityId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Nashik City' });

    expect(res.status).toBe(200);
    expect(res.body.city.name).toBe('Nashik City');
  });

  it('DELETE /api/locations/cities/:id — admin can delete', async () => {
    const res = await request(app)
      .delete(`/api/locations/cities/${newCityId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });
});

// ─── VILLAGES ─────────────────────────────────────────────────────────────────

describe('Villages', () => {
  let newVillageId;

  it('GET /api/locations/villages — returns all villages', async () => {
    const res = await request(app)
      .get('/api/locations/villages')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.villages.length).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/locations/villages?city_id= — filters by city', async () => {
    const res = await request(app)
      .get(`/api/locations/villages?city_id=${ctx.mumbaiCityId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.villages.length).toBeGreaterThanOrEqual(1);
    expect(res.body.villages[0].city_name).toBe('Mumbai');
  });

  it('GET /api/locations/villages/:id — returns village with full context', async () => {
    const res = await request(app)
      .get(`/api/locations/villages/${ctx.dharaviVillageId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.village.name).toBe('Dharavi');
    expect(res.body.village.city_name).toBe('Mumbai');
    expect(res.body.village.state_name).toBe('Maharashtra');
    expect(res.body.village.country_name).toBe('India');
  });

  it('GET /api/locations/villages/:id — 404 for unknown', async () => {
    const res = await request(app)
      .get('/api/locations/villages/ghost')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(404);
  });

  it('POST /api/locations/villages — editor can create village', async () => {
    const res = await request(app)
      .post('/api/locations/villages')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Kurla', city_id: ctx.mumbaiCityId, pincode: '400070' });

    expect(res.status).toBe(201);
    expect(res.body.village.name).toBe('Kurla');
    expect(res.body.village.pincode).toBe('400070');
    newVillageId = res.body.village.id;
  });

  it('POST /api/locations/villages — 409 for duplicate', async () => {
    const res = await request(app)
      .post('/api/locations/villages')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Dharavi', city_id: ctx.mumbaiCityId });

    expect(res.status).toBe(409);
  });

  it('POST /api/locations/villages — 400 if required fields missing', async () => {
    const res = await request(app)
      .post('/api/locations/villages')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'NoCity' });

    expect(res.status).toBe(400);
  });

  it('POST /api/locations/villages — 404 if city not found', async () => {
    const res = await request(app)
      .post('/api/locations/villages')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Ghost Village', city_id: 'ghost-city' });

    expect(res.status).toBe(404);
  });

  it('viewer cannot create village (403)', async () => {
    const res = await request(app)
      .post('/api/locations/villages')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Attempt', city_id: ctx.mumbaiCityId });

    expect(res.status).toBe(403);
  });

  it('PUT /api/locations/villages/:id — editor can update', async () => {
    const res = await request(app)
      .put(`/api/locations/villages/${newVillageId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'Kurla West', pincode: '400071' });

    expect(res.status).toBe(200);
    expect(res.body.village.name).toBe('Kurla West');
    expect(res.body.village.pincode).toBe('400071');
  });

  it('PUT /api/locations/villages/:id — 404 for unknown', async () => {
    const res = await request(app)
      .put('/api/locations/villages/ghost')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ name: 'X' });

    expect(res.status).toBe(404);
  });

  it('PUT /api/locations/villages/:id — 400 if nothing to update', async () => {
    const res = await request(app)
      .put(`/api/locations/villages/${newVillageId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('DELETE /api/locations/villages/:id — admin can delete', async () => {
    const res = await request(app)
      .delete(`/api/locations/villages/${newVillageId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('DELETE /api/locations/villages/:id — editor cannot delete (403)', async () => {
    const res = await request(app)
      .delete(`/api/locations/villages/${ctx.dharaviVillageId}`)
      .set('Authorization', `Bearer ${editorToken}`);

    expect(res.status).toBe(403);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app).get('/api/locations/villages');
    expect(res.status).toBe(401);
  });
});
