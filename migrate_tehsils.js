import db from './db.js';

async function migrate() {
  console.log('🚀 Starting Tehsil Migration...');
  try {
    // 0. Ensure tables exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS tehsils (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        city_id INT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
      )
    `);
    try {
      await db.query(`ALTER TABLE villages ADD COLUMN tehsil_id INT UNSIGNED, ADD FOREIGN KEY (tehsil_id) REFERENCES tehsils(id) ON DELETE CASCADE`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        // Ignore if column already exists
      }
    }
    console.log('✅ Ensured schema is ready.');

    // 1. Get Rajasthan State ID (Assuming it's ID 1 or the only state)
    const [states] = await db.query("SELECT id FROM states WHERE name LIKE '%Rajasthan%' OR name LIKE '%Rajsthan%' LIMIT 1");
    if (states.length === 0) {
      console.log('❌ Could not find Rajasthan in states table. Please check your data.');
      process.exit(1);
    }
    const rajasthanId = states[0].id;
    console.log(`✅ Found Rajasthan with ID: ${rajasthanId}`);

    // 2. Create Jaipur City under Rajasthan
    let jaipurCityId;
    const [existingJaipurCity] = await db.query("SELECT id FROM cities WHERE name = 'Jaipur' AND state_id = ?", [rajasthanId]);
    if (existingJaipurCity.length > 0) {
      jaipurCityId = existingJaipurCity[0].id;
      console.log(`✅ Found existing Jaipur City with ID: ${jaipurCityId}`);
    } else {
      const [insertRes] = await db.query("INSERT INTO cities (name, state_id) VALUES ('Jaipur', ?)", [rajasthanId]);
      jaipurCityId = insertRes.insertId;
      console.log(`✅ Created Jaipur City with ID: ${jaipurCityId}`);
    }

    // 3. Find all existing "Cities" (which are actually tehsils) EXCEPT the new Jaipur city itself if we just created it.
    // Let's get all cities under Rajasthan
    const [cities] = await db.query("SELECT id, name FROM cities WHERE state_id = ? AND id != ?", [rajasthanId, jaipurCityId]);
    console.log(`🔍 Found ${cities.length} legacy 'Cities' to convert to Tehsils.`);

    for (const city of cities) {
      // 4. Create a Tehsil for each legacy City under the new Jaipur City
      let tehsilId;
      const [existingTehsil] = await db.query("SELECT id FROM tehsils WHERE name = ? AND city_id = ?", [city.name, jaipurCityId]);
      
      if (existingTehsil.length > 0) {
        tehsilId = existingTehsil[0].id;
      } else {
        const [insertTehsil] = await db.query("INSERT INTO tehsils (name, city_id) VALUES (?, ?)", [city.name, jaipurCityId]);
        tehsilId = insertTehsil.insertId;
      }
      
      console.log(`✅ Created/Found Tehsil '${city.name}' with ID: ${tehsilId}`);

      // 5. Update all villages that belong to this legacy City to point to the new Tehsil
      const [updateRes] = await db.query("UPDATE villages SET tehsil_id = ?, city_id = ? WHERE city_id = ?", [tehsilId, jaipurCityId, city.id]);
      console.log(`   -> Migrated ${updateRes.affectedRows} villages to Tehsil '${city.name}'`);

      // 6. Optional: We can delete the legacy City now since it has been migrated
      await db.query("DELETE FROM cities WHERE id = ?", [city.id]);
      console.log(`   -> Deleted legacy City record for '${city.name}'`);
    }

    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
