const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add a Postgres plugin in Railway (or set DATABASE_URL locally) before starting the app.');
}

// Railway's internal Postgres connections don't need SSL; external/public
// connection strings from most managed Postgres providers do. This flag
// lets you force it on via env if you ever point at an external DB.
const useSSL = process.env.PGSSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Database schema ready.');
}

module.exports = { pool, initSchema };
