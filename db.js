import mysql from 'mysql2/promise';
import 'dotenv/config';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Initialize and perform auto-migration checks on startup
const initDb = async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL database successfully.');
    conn.release();

    const dbName = process.env.DB_NAME;

    // Check if 'mime_type' column exists in 'images'
    const [mimeCol] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'images' AND COLUMN_NAME = 'mime_type'`,
      [dbName]
    );

    if (mimeCol.length === 0) {
      console.log('🔄 Migrating database: Adding mime_type column to images table...');
      await pool.query(
        `ALTER TABLE images ADD COLUMN mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg'`
      );
      console.log('✅ Added mime_type column.');
    }

    // Check if 'data' column exists in 'images'
    const [dataCol] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'images' AND COLUMN_NAME = 'data'`,
      [dbName]
    );

    if (dataCol.length === 0) {
      console.log('🔄 Migrating database: Adding LONGBLOB data column to images table...');
      await pool.query(
        `ALTER TABLE images ADD COLUMN data LONGBLOB`
      );
      console.log('✅ Added data LONGBLOB column.');
    }

    // Auto-create tehsils table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tehsils (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        city_id INT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
      )
    `);
    
    // Check if 'tehsil_id' column exists in 'villages'
    const [tehsilCol] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'villages' AND COLUMN_NAME = 'tehsil_id'`,
      [dbName]
    );

    if (tehsilCol.length === 0) {
      console.log('🔄 Migrating database: Adding tehsil_id column to villages table...');
      await pool.query(
        `ALTER TABLE villages ADD COLUMN tehsil_id INT UNSIGNED, ADD FOREIGN KEY (tehsil_id) REFERENCES tehsils(id) ON DELETE CASCADE`
      );
      console.log('✅ Added tehsil_id column.');
    }

  } catch (err) {
    console.error('❌ MySQL Database initialization failed:', err.message);
  }
};

initDb();

export default pool;
