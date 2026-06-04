import fs from 'fs';
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'root',
  password: '',
  database: 'dgdrive',
});

async function run() {
  console.log('Reading Excel file...');
  const wb = xlsx.readFile('/Users/abhinav/Downloads/Maggie Execution Report-02-06-2026.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows.`);

  for (const row of rows) {
    const stateName = row['State'];
    const cityName = row['District Name'];
    const tehsilName = row['Tehsil Name'];
    const villageName = row['Village Name'];

    if (!stateName || !cityName || !tehsilName || !villageName) continue;

    // 1. Get or Create State
    let [states] = await db.query('SELECT id FROM states WHERE name = ?', [stateName]);
    let stateId;
    if (states.length === 0) {
      const [res] = await db.query('INSERT INTO states (name) VALUES (?)', [stateName]);
      stateId = res.insertId;
    } else {
      stateId = states[0].id;
    }

    // 2. Get or Create City (District)
    let [cities] = await db.query('SELECT id FROM cities WHERE name = ? AND state_id = ?', [cityName, stateId]);
    let cityId;
    if (cities.length === 0) {
      const [res] = await db.query('INSERT INTO cities (name, state_id) VALUES (?, ?)', [cityName, stateId]);
      cityId = res.insertId;
    } else {
      cityId = cities[0].id;
    }

    // 3. Get or Create Tehsil
    let [tehsils] = await db.query('SELECT id FROM tehsils WHERE name = ? AND city_id = ?', [tehsilName, cityId]);
    let tehsilId;
    if (tehsils.length === 0) {
      const [res] = await db.query('INSERT INTO tehsils (name, city_id) VALUES (?, ?)', [tehsilName, cityId]);
      tehsilId = res.insertId;
    } else {
      tehsilId = tehsils[0].id;
    }

    // 4. Get or Create Village
    let [villages] = await db.query('SELECT id FROM villages WHERE name = ? AND tehsil_id = ?', [villageName, tehsilId]);
    if (villages.length === 0) {
      await db.query('INSERT INTO villages (name, tehsil_id) VALUES (?, ?)', [villageName, tehsilId]);
    }
  }

  console.log('Import completed successfully!');
  process.exit(0);
}

run().catch(console.error);
