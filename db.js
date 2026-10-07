require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL не задан'); process.exit(1); }

const local = /localhost|127\.0\.0\.1/.test(url);
const ssl = process.env.PGSSL === 'disable' || local ? false : { rejectUnauthorized: false };

const pool = new Pool({ connectionString: url, ssl, max: 10 });
module.exports = { pool };
