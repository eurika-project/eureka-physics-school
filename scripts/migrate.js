const fs = require('fs');
const path = require('path');
const { pool } = require('../server/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Миграция выполнена.');
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
