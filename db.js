require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// simple test log (optional)
pool.connect()
  .then(() => console.log("Connected to Supabase PostgreSQL"))
  .catch(err => console.error("DB Connection Error:", err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
