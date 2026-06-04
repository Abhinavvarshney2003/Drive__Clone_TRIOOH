const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// ─── COUNTRIES ────────────────────────────────────────────────────────────────

// GET /api/locations/countries
router.get('/countries', (req, res) => {
  try {
    const countries = db.prepare(`SELECT * FROM countries ORDER BY name ASC`).all();
    res.json({ countries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/countries/:id
router.get('/countries/:id', (req, res) => {
  try {
    const country = db.prepare(`SELECT * FROM countries WHERE id = ?`).get(req.params.id);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    res.json({ country });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/locations/countries
router.post('/countries', requireRole('editor'), (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'name and code are required' });

    const existing = db.prepare('SELECT id FROM countries WHERE code = ? OR name = ?').get(code.toUpperCase(), name.trim());
    if (existing) return res.status(409).json({ error: 'Country with this name or code already exists' });

    const id = uuidv4();
    db.prepare('INSERT INTO countries (id, name, code) VALUES (?, ?, ?)').run(id, name.trim(), code.toUpperCase());
    const country = db.prepare('SELECT * FROM countries WHERE id = ?').get(id);
    res.status(201).json({ country });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/locations/countries/:id
router.put('/countries/:id', requireRole('editor'), (req, res) => {
  try {
    const { name, code } = req.body;
    const country = db.prepare('SELECT * FROM countries WHERE id = ?').get(req.params.id);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    if (!name && !code) return res.status(400).json({ error: 'Nothing to update' });

    const newName = name ? name.trim() : country.name;
    const newCode = code ? code.toUpperCase() : country.code;
    db.prepare('UPDATE countries SET name = ?, code = ? WHERE id = ?').run(newName, newCode, req.params.id);
    const updated = db.prepare('SELECT * FROM countries WHERE id = ?').get(req.params.id);
    res.json({ country: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/locations/countries/:id
router.delete('/countries/:id', requireRole('super_admin'), (req, res) => {
  try {
    const country = db.prepare('SELECT * FROM countries WHERE id = ?').get(req.params.id);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    db.prepare('DELETE FROM countries WHERE id = ?').run(req.params.id);
    res.json({ message: 'Country deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATES ───────────────────────────────────────────────────────────────────

// GET /api/locations/states?country_id=
router.get('/states', (req, res) => {
  try {
    const { country_id } = req.query;
    let states;
    if (country_id) {
      states = db.prepare(`
        SELECT s.*, c.name as country_name FROM states s
        JOIN countries c ON c.id = s.country_id
        WHERE s.country_id = ? ORDER BY s.name ASC
      `).all(country_id);
    } else {
      states = db.prepare(`
        SELECT s.*, c.name as country_name FROM states s
        JOIN countries c ON c.id = s.country_id ORDER BY s.name ASC
      `).all();
    }
    res.json({ states });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/states/:id
router.get('/states/:id', (req, res) => {
  try {
    const state = db.prepare(`
      SELECT s.*, c.name as country_name FROM states s
      JOIN countries c ON c.id = s.country_id WHERE s.id = ?
    `).get(req.params.id);
    if (!state) return res.status(404).json({ error: 'State not found' });
    res.json({ state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/locations/states
router.post('/states', requireRole('editor'), (req, res) => {
  try {
    const { name, code, country_id } = req.body;
    if (!name || !code || !country_id) return res.status(400).json({ error: 'name, code and country_id are required' });

    const country = db.prepare('SELECT id FROM countries WHERE id = ?').get(country_id);
    if (!country) return res.status(404).json({ error: 'Country not found' });

    const existing = db.prepare('SELECT id FROM states WHERE name = ? AND country_id = ?').get(name.trim(), country_id);
    if (existing) return res.status(409).json({ error: 'State already exists in this country' });

    const id = uuidv4();
    db.prepare('INSERT INTO states (id, name, code, country_id) VALUES (?, ?, ?, ?)').run(id, name.trim(), code.toUpperCase(), country_id);
    const state = db.prepare(`
      SELECT s.*, c.name as country_name FROM states s
      JOIN countries c ON c.id = s.country_id WHERE s.id = ?
    `).get(id);
    res.status(201).json({ state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/locations/states/:id
router.put('/states/:id', requireRole('editor'), (req, res) => {
  try {
    const { name, code } = req.body;
    const state = db.prepare('SELECT * FROM states WHERE id = ?').get(req.params.id);
    if (!state) return res.status(404).json({ error: 'State not found' });
    if (!name && !code) return res.status(400).json({ error: 'Nothing to update' });

    const newName = name ? name.trim() : state.name;
    const newCode = code ? code.toUpperCase() : state.code;
    db.prepare('UPDATE states SET name = ?, code = ? WHERE id = ?').run(newName, newCode, req.params.id);
    const updated = db.prepare(`
      SELECT s.*, c.name as country_name FROM states s
      JOIN countries c ON c.id = s.country_id WHERE s.id = ?
    `).get(req.params.id);
    res.json({ state: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/locations/states/:id
router.delete('/states/:id', requireRole('super_admin'), (req, res) => {
  try {
    const state = db.prepare('SELECT * FROM states WHERE id = ?').get(req.params.id);
    if (!state) return res.status(404).json({ error: 'State not found' });
    db.prepare('DELETE FROM states WHERE id = ?').run(req.params.id);
    res.json({ message: 'State deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CITIES ───────────────────────────────────────────────────────────────────

// GET /api/locations/cities?state_id=
router.get('/cities', (req, res) => {
  try {
    const { state_id } = req.query;
    let cities;
    if (state_id) {
      cities = db.prepare(`
        SELECT ci.*, s.name as state_name, c.name as country_name FROM cities ci
        JOIN states s ON s.id = ci.state_id
        JOIN countries c ON c.id = s.country_id
        WHERE ci.state_id = ? ORDER BY ci.name ASC
      `).all(state_id);
    } else {
      cities = db.prepare(`
        SELECT ci.*, s.name as state_name, c.name as country_name FROM cities ci
        JOIN states s ON s.id = ci.state_id
        JOIN countries c ON c.id = s.country_id ORDER BY ci.name ASC
      `).all();
    }
    res.json({ cities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/cities/:id
router.get('/cities/:id', (req, res) => {
  try {
    const city = db.prepare(`
      SELECT ci.*, s.name as state_name, c.name as country_name FROM cities ci
      JOIN states s ON s.id = ci.state_id
      JOIN countries c ON c.id = s.country_id WHERE ci.id = ?
    `).get(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    res.json({ city });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/locations/cities
router.post('/cities', requireRole('editor'), (req, res) => {
  try {
    const { name, state_id } = req.body;
    if (!name || !state_id) return res.status(400).json({ error: 'name and state_id are required' });

    const state = db.prepare('SELECT id FROM states WHERE id = ?').get(state_id);
    if (!state) return res.status(404).json({ error: 'State not found' });

    const existing = db.prepare('SELECT id FROM cities WHERE name = ? AND state_id = ?').get(name.trim(), state_id);
    if (existing) return res.status(409).json({ error: 'City already exists in this state' });

    const id = uuidv4();
    db.prepare('INSERT INTO cities (id, name, state_id) VALUES (?, ?, ?)').run(id, name.trim(), state_id);
    const city = db.prepare(`
      SELECT ci.*, s.name as state_name, c.name as country_name FROM cities ci
      JOIN states s ON s.id = ci.state_id
      JOIN countries c ON c.id = s.country_id WHERE ci.id = ?
    `).get(id);
    res.status(201).json({ city });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/locations/cities/:id
router.put('/cities/:id', requireRole('editor'), (req, res) => {
  try {
    const { name } = req.body;
    const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    if (!name) return res.status(400).json({ error: 'name is required' });

    db.prepare('UPDATE cities SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    const updated = db.prepare(`
      SELECT ci.*, s.name as state_name, c.name as country_name FROM cities ci
      JOIN states s ON s.id = ci.state_id
      JOIN countries c ON c.id = s.country_id WHERE ci.id = ?
    `).get(req.params.id);
    res.json({ city: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/locations/cities/:id
router.delete('/cities/:id', requireRole('super_admin'), (req, res) => {
  try {
    const city = db.prepare('SELECT * FROM cities WHERE id = ?').get(req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    db.prepare('DELETE FROM cities WHERE id = ?').run(req.params.id);
    res.json({ message: 'City deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VILLAGES ─────────────────────────────────────────────────────────────────

// GET /api/locations/villages?city_id=
router.get('/villages', (req, res) => {
  try {
    const { city_id } = req.query;
    let villages;
    if (city_id) {
      villages = db.prepare(`
        SELECT v.*, ci.name as city_name, s.name as state_name, co.name as country_name FROM villages v
        JOIN cities ci ON ci.id = v.city_id
        JOIN states s ON s.id = ci.state_id
        JOIN countries co ON co.id = s.country_id
        WHERE v.city_id = ? ORDER BY v.name ASC
      `).all(city_id);
    } else {
      villages = db.prepare(`
        SELECT v.*, ci.name as city_name, s.name as state_name, co.name as country_name FROM villages v
        JOIN cities ci ON ci.id = v.city_id
        JOIN states s ON s.id = ci.state_id
        JOIN countries co ON co.id = s.country_id ORDER BY v.name ASC
      `).all();
    }
    res.json({ villages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/locations/villages/:id
router.get('/villages/:id', (req, res) => {
  try {
    const village = db.prepare(`
      SELECT v.*, ci.name as city_name, s.name as state_name, co.name as country_name FROM villages v
      JOIN cities ci ON ci.id = v.city_id
      JOIN states s ON s.id = ci.state_id
      JOIN countries co ON co.id = s.country_id WHERE v.id = ?
    `).get(req.params.id);
    if (!village) return res.status(404).json({ error: 'Village not found' });
    res.json({ village });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/locations/villages
router.post('/villages', requireRole('editor'), (req, res) => {
  try {
    const { name, city_id, pincode } = req.body;
    if (!name || !city_id) return res.status(400).json({ error: 'name and city_id are required' });

    const city = db.prepare('SELECT id FROM cities WHERE id = ?').get(city_id);
    if (!city) return res.status(404).json({ error: 'City not found' });

    const existing = db.prepare('SELECT id FROM villages WHERE name = ? AND city_id = ?').get(name.trim(), city_id);
    if (existing) return res.status(409).json({ error: 'Village already exists in this city' });

    const id = uuidv4();
    db.prepare('INSERT INTO villages (id, name, city_id, pincode) VALUES (?, ?, ?, ?)').run(id, name.trim(), city_id, pincode || null);
    const village = db.prepare(`
      SELECT v.*, ci.name as city_name, s.name as state_name, co.name as country_name FROM villages v
      JOIN cities ci ON ci.id = v.city_id
      JOIN states s ON s.id = ci.state_id
      JOIN countries co ON co.id = s.country_id WHERE v.id = ?
    `).get(id);
    res.status(201).json({ village });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/locations/villages/:id
router.put('/villages/:id', requireRole('editor'), (req, res) => {
  try {
    const { name, pincode } = req.body;
    const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(req.params.id);
    if (!village) return res.status(404).json({ error: 'Village not found' });
    if (!name && !pincode) return res.status(400).json({ error: 'Nothing to update' });

    const newName    = name    ? name.trim()    : village.name;
    const newPincode = pincode !== undefined ? pincode : village.pincode;
    db.prepare('UPDATE villages SET name = ?, pincode = ? WHERE id = ?').run(newName, newPincode, req.params.id);
    const updated = db.prepare(`
      SELECT v.*, ci.name as city_name, s.name as state_name, co.name as country_name FROM villages v
      JOIN cities ci ON ci.id = v.city_id
      JOIN states s ON s.id = ci.state_id
      JOIN countries co ON co.id = s.country_id WHERE v.id = ?
    `).get(req.params.id);
    res.json({ village: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/locations/villages/:id
router.delete('/villages/:id', requireRole('super_admin'), (req, res) => {
  try {
    const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(req.params.id);
    if (!village) return res.status(404).json({ error: 'Village not found' });
    db.prepare('DELETE FROM villages WHERE id = ?').run(req.params.id);
    res.json({ message: 'Village deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
