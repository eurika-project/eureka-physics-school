const bcrypt = require('bcryptjs');
const { pool } = require('../server/db');

(async () => {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 8) {
    console.error('Задайте ADMIN_EMAIL и ADMIN_PASSWORD (минимум 8 символов).');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, name, password_hash, role, school, city)
     VALUES ($1, 'Администратор', $2, 'teacher', 'Администрация', '—')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'teacher'`,
    [email, hash]
  );
  console.log('Учитель-администратор создан/обновлён:', email);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
