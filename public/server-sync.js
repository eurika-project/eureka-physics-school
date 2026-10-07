/* Подключает интерфейс «Эврика!» к серверу: вход, аккаунты, попытки и опросы хранятся в PostgreSQL. */
(() => {
  const cache = { user: null, users: {}, attempts: [], surveys: [] };
  const QKEY = 'eureka_queue_v1';

  async function api(path, body) {
    const r = await fetch('/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    });
    let d = {}; try { d = await r.json(); } catch {}
    if (!r.ok) throw Object.assign(new Error(d.error || 'Ошибка сервера'), { status: r.status });
    return d;
  }

  const getQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
  const setQ = q => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch {} };
  async function send(path, body) {
    try { await api(path, body); }
    catch (e) { if (!e.status) setQ([...getQ(), { path, body, email: cache.user?.email }]); }
  }
  async function flush() {
    if (!cache.user) return;
    const rest = [];
    for (const it of getQ()) {
      if (it.email !== cache.user.email) { rest.push(it); continue; }
      try { await api(it.path, it.body); } catch (e) { if (!e.status) rest.push(it); }
    }
    setQ(rest);
  }
  async function refresh() {
    try {
      const d = await api('/me');
      cache.user = d.user; cache.attempts = d.attempts || []; cache.surveys = d.surveys || [];
      cache.users = {};
      (d.students || []).forEach(s => { cache.users[s.email] = s; });
      cache.users[d.user.email] = d.user;
    } catch (e) {
      if (e.status === 401) { cache.user = null; cache.attempts = []; cache.surveys = []; cache.users = {}; }
    }
  }

  // Подмена функций хранения
  window.current = () => cache.user;
  window.users = () => cache.users;
  window.allAttempts = () => cache.attempts;
  window.saveAttempt = a => { cache.attempts.push(a); send('/attempts', a); };
  const origRead = window.read, origWrite = window.write;
  window.read = (k, d) => (k === KEYS.surveysV3 ? cache.surveys : origRead(k, d));
  window.write = (k, v) => {
    if (k === KEYS.surveysV3) {
      const n = v[v.length - 1]; cache.surveys = v;
      if (n) send('/surveys', { kind: n.kind, answers: n.answers });
      return;
    }
    return origWrite(k, v);
  };

  // Вход / регистрация / выход
  window.doLogin = async () => {
    const email = ($('#loginEmail')?.value || '').trim(), password = $('#loginPass')?.value || '';
    try { await api('/login', { email, password }); await refresh(); await flush(); state.authError = ''; state.view = 'home'; }
    catch (e) { state.authError = e.message; }
    render();
  };
  window.doRegister = async () => {
    const v = id => ($(id)?.value || '').trim();
    const body = { name: v('#regName'), email: v('#regEmail'), password: $('#regPass')?.value || '', role: state.role,
      className: v('#regClass'), teacherCode: v('#regTeacherCode'), school: v('#regSchool'), city: v('#regCity') };
    try { await api('/register', body); await refresh(); state.authError = ''; state.view = 'home'; }
    catch (e) { state.authError = e.message; }
    render();
  };
  window.doLogout = async () => {
    try { await api('/logout', {}); } catch {}
    cache.user = null; cache.attempts = []; cache.surveys = []; cache.users = {};
    state.view = 'home'; render();
  };

  // Форма: поля школы и города для учителя, без демо-кода
  const origAuth = window.auth;
  window.auth = () => origAuth()
    .replace('от 4 символов', 'от 6 символов')
    .replace(/<small>Демо-код:[\s\S]*?<\/small>/, '')
    .replace('<label>Код доступа учителя',
      '<label>Школа<input id="regSchool" maxlength="120"></label><label>Город<input id="regCity" maxlength="80"></label><label>Код доступа учителя');

  // Свежие данные при открытии кабинета и прогресса
  const origGoto = window.goto;
  window.goto = (view, extra) => {
    if (view === 'teacher' || view === 'progress') refresh().then(() => origGoto(view, extra));
    else origGoto(view, extra);
  };

  window.addEventListener('online', async () => { await flush(); await refresh(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  (async () => { await refresh(); await flush(); render(); })();
})();
