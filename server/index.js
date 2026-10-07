require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const { JWT_SECRET, TEACHER_CODE, NODE_ENV } = process.env;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('JWT_SECRET не задан или слишком короткий (нужно 16+ символов).');
  process.exit(1);
}
const PROD = NODE_ENV === 'production';
const COOKIE = 'eureka_token';
const ROOT = path.join(__dirname, '..');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже.' } });

const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Ошибка сервера' }); });
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const num = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

function setSession(res, user) {
  const token = jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: 7 * 24 * 3600 * 1000, path: '/' });
}
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role,
  className: u.class_name || null, school: u.school || null, city: u.city || null });

async function auth(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies[COOKIE] || '', JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [uid]);
    if (!rows[0]) throw new Error('no user');
    req.user = rows[0];
    next();
  } catch { res.status(401).json({ error: 'Требуется вход' }); }
}

app.get('/health', (_req, res) => res.send('ok'));

app.post('/api/register', authLimiter, wrap(async (req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || ''), role = req.body.role === 'teacher' ? 'teacher' : 'student';
  const className = str(req.body.className, 20), school = str(req.body.school, 120), city = str(req.body.city, 80);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Проверь имя и почту.' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов.' });
  if (role === 'student' && !className) return res.status(400).json({ error: 'Выбери свой класс.' });
  if (role === 'teacher') {
    if (!TEACHER_CODE || String(req.body.teacherCode || '') !== TEACHER_CODE)
      return res.status(403).json({ error: 'Неверный код доступа учителя.' });
    if (!school || !city) return res.status(400).json({ error: 'Укажи школу и город.' });
  }
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email,name,password_hash,role,class_name,school,city)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [email, name, hash, role, role === 'student' ? className : null, role === 'teacher' ? school : null, role === 'teacher' ? city : null]);
    setSession(res, rows[0]);
    res.json({ user: publicUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Эта почта уже зарегистрирована.' });
    throw e;
  }
}));

app.post('/api/login', authLimiter, wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase(), password = String(req.body.password || '');
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  const u = rows[0];
  const ok = u && await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Неверная почта или пароль.' });
  setSession(res, u);
  res.json({ user: publicUser(u) });
}));

app.post('/api/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });

const attemptOut = r => ({ id: r.id, email: r.email, name: r.name, className: r.class_name || '—', role: r.role,
  source: r.source, chapterId: r.chapter_id, lessonId: r.lesson_id, percent: r.percent, correct: r.correct,
  total: r.total, wrong: r.wrong, durationSec: r.duration_sec, isReview: r.is_review, answers: r.answers, ts: Number(r.ts) });

app.get('/api/me', auth, wrap(async (req, res) => {
  const u = req.user, teacher = u.role === 'teacher';
  const base = `SELECT a.*, u.email, u.name, u.class_name, u.role FROM attempts a JOIN users u ON u.id=a.user_id`;
  const { rows } = teacher
    ? await pool.query(`${base} ORDER BY a.ts`)
    : await pool.query(`${base} WHERE a.user_id=$1 ORDER BY a.ts`, [u.id]);
  const out = { user: publicUser(u), attempts: rows.map(attemptOut) };
  if (teacher) {
    const st = await pool.query(`SELECT * FROM users WHERE role='student' ORDER BY name`);
    out.students = st.rows.map(publicUser);
    const sv = await pool.query(`SELECT s.*, u.email, u.name, u.class_name FROM surveys s JOIN users u ON u.id=s.user_id ORDER BY s.ts`);
    out.surveys = sv.rows.map(r => ({ id: r.id, kind: r.kind, email: r.email, name: r.name,
      className: r.class_name || '', answers: r.answers, ts: Number(r.ts) }));
  }
  res.json(out);
}));

app.post('/api/attempts', auth, wrap(async (req, res) => {
  const a = req.body || {};
  const id = str(a.id, 80), source = str(a.source, 20);
  if (!id || !/^[pc]\d+$/.test(source)) return res.status(400).json({ error: 'Некорректная попытка' });
  const answers = Array.isArray(a.answers) ? a.answers.slice(0, 100) : [];
  await pool.query(
    `INSERT INTO attempts (id,user_id,source,chapter_id,lesson_id,percent,correct,total,wrong,duration_sec,is_review,answers,ts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (id) DO NOTHING`,
    [id, req.user.id, source, str(a.chapterId, 10), a.lessonId ? str(a.lessonId, 20) : null,
     Math.min(100, Math.max(0, num(a.percent))), num(a.correct), num(a.total), num(a.wrong), num(a.durationSec),
     !!a.isReview, JSON.stringify(answers), num(a.ts) || Date.now()]);
  res.json({ ok: true });
}));

app.post('/api/surveys', auth, wrap(async (req, res) => {
  const kind = req.body.kind === 'teacher' ? 'teacher' : 'student';
  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  await pool.query('INSERT INTO surveys (user_id,kind,answers,ts) VALUES ($1,$2,$3,$4)',
    [req.user.id, kind, JSON.stringify(answers), Date.now()]);
  res.json({ ok: true });
}));

app.use(express.static(path.join(ROOT, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Эврика! запущена на порту ${port}`));
