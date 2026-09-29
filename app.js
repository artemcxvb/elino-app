(function () {
  'use strict';
  const D = window.ELINO, CH = D.chapters;
  const Q = window.ELINO_Q.map((r, i) => ({ id: i, c: r[0], q: r[1], ok: r[2], bad: r[3], e: r[4] }));
  const chById = Object.fromEntries(CH.map(c => [c.id, c]));
  const EXAM_N = 20, PASS = 80;
  const KEY = 'elino.v1';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // ---------- storage
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  S.read = S.read || {}; S.best = S.best || {}; S.wrong = S.wrong || {}; S.hist = S.hist || [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };
  const CFG = window.ELINO_CONFIG || {};
  const SHEETS_URL = String(CFG.SHEETS_URL || '').trim();
  if (!S.dev) { S.dev = 'D-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(); save(); }

  // ---------- сотрудник
  const FIO_RE = /^[A-Za-zА-Яа-яЁё]+(?:[-'’][A-Za-zА-Яа-яЁё]+)*$/;
  function normFio(v) {
    return String(v || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
      .map(w => w.split('-').map(p => p ? p[0].toLocaleUpperCase('ru') + p.slice(1).toLocaleLowerCase('ru') : p).join('-')).join(' ');
  }
  function normPhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) d = d.slice(1);
    if (d.length !== 10) return '';
    return '+7 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8);
  }
  function phoneError(v) {
    if (!String(v || '').trim()) return 'Укажи номер телефона';
    if (!normPhone(v)) return 'Номер должен быть в формате +7 900 000-00-00';
    return '';
  }
  function fioError(v) {
    const w = normFio(v).split(' ').filter(Boolean);
    if (w.length < 2) return 'Введи фамилию и имя (и отчество, если есть) — минимум 2 слова.';
    if (w.some(x => !FIO_RE.test(x))) return 'ФИО может содержать только буквы (можно дефис).';
    if (w.some(x => x.length < 2)) return 'Укажи полные фамилию и имя, без инициалов.';
    return '';
  }
  const empLine = () => S.emp ? `<div class="emp"><span>👤 Сдаёт: <b>${esc(S.emp.fio)}</b>${S.emp.tab ? ` <span class="muted">(${esc(S.emp.tab)})</span>` : ''}</span></div>` : '';

  // ---------- доступ к тестам: обучение → код от руководителя
  const UL = window.ELINO_UNLOCK;
  const ULKEY = 'elino.unlock', REQKEY = 'elino.codereq', TRYKEY = 'elino.codetry';
  const REQ_COOLDOWN = 60000, MAX_TRIES = 5, TRY_WAIT = 30000;
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const phoneDigits = v => { const p = normPhone(v); return p ? '7' + p.replace(/\D/g, '').slice(1) : ''; };
  const curDigits = () => S.emp ? phoneDigits(S.emp.tab) : '';
  // в хранилище лежит не флаг, а хэш кода именно для этого телефона: чужой/подделанный флаг не подойдёт
  const unlockToken = d => UL.hash32(UL.SALT + ':unlock:' + d + ':' + UL.codeFor(d)).toString(36);
  function isUnlocked() {
    const d = curDigits(); if (!d) return false;
    const u = lsGet(ULKEY, {});
    return u[d] === unlockToken(d);
  }
  const chaptersDone = () => CH.every(c => S.read[c.id]);
  const studiedN = () => CH.filter(c => S.read[c.id]).length;

  // ---------- отправка результатов (Google Sheets) с офлайн-очередью
  const QKEY = 'elino.queue';
  const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) { return []; } };
  const saveQ = q => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { } };
  let flushing = null;
  function flushQueue() {
    if (!SHEETS_URL) return Promise.resolve({ sent: 0, left: loadQ().length });
    if (flushing) return flushing;
    flushing = (async () => {
      let sent = 0;
      for (const rec of loadQ()) {
        if (navigator.onLine === false) break;
        try {
          await fetch(SHEETS_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) });
          saveQ(loadQ().filter(r => r.rid !== rec.rid)); sent++;
        } catch (e) { break; }
      }
      return { sent, left: loadQ().length };
    })().finally(() => { flushing = null; });
    return flushing;
  }
  function archive(rec) { // полный журнал результатов на устройстве (последние 200)
    try { const k = 'elino.results', arr = JSON.parse(localStorage.getItem(k) || '[]'); arr.push(rec); localStorage.setItem(k, JSON.stringify(arr.slice(-200))); } catch (e) { }
  }
  function submitResult(rec) {
    const q = loadQ(); q.push(rec); saveQ(q);
    return flushQueue().then(() => !loadQ().some(r => r.rid === rec.rid));
  }
  window.addEventListener('online', () => flushQueue().then(r => { if (r.sent) { toast('Отправлено: ' + r.sent); if (codeTimer) paintCode(); } }));
  window.ELINO_DEBUG = { loadQ, flushQueue, isUnlocked, unlockToken };

  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
  const toast = t => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); };

  const app = $('#app');
  let quiz = null;

  function shell(title, body, opts = {}) {
    const tab = opts.tab || 'learn';
    const back = opts.back ? `<button class="back" aria-label="Назад" data-go="${opts.back}">‹</button>` : '';
    const badge = opts.badge ? `<span class="badge">${opts.badge}</span>` : '';
    const tabs = [['learn', '📚', 'Обучение'], ['test', isUnlocked() ? '📝' : '🔒', 'Тест'], ['cheat', '⚡', 'Шпаргалка'], ['more', '⋯', 'Ещё']]
      .map(([k, i, t]) => `<a href="#/${k}" class="${tab === k ? 'on' : ''}"><span class="ic">${i}</span>${t}</a>`).join('');
    app.innerHTML = `<header class="topbar">${back}<h1>${title}</h1>${badge}</header><main>${body}</main><nav class="tabbar"><div class="in">${tabs}</div></nav>`;
    window.scrollTo(0, 0);
  }

  // ---------- Обучение
  function viewLearn() {
    const n = CH.filter(c => S.read[c.id]).length, pct = Math.round(n / CH.length * 100);
    const ins = (!isStandalone() && !S.hideInstall) ? `<div class="banner">📲 Установи приложение на телефон — будет работать без интернета.<button data-go="#/more">Как?</button></div>` : '';
    const items = CH.map((c, i) => {
      const b = S.best['ch:' + c.id];
      return `<a class="item" href="#/ch/${c.id}"><div class="ic">${c.icon}</div><div class="tt"><b>${i + 1}. ${c.title}</b><span>${c.sub}${b != null ? ` · тест: ${b}%` : ''}</span></div>${S.read[c.id] ? '<span class="done">✓</span>' : '<span class="todo"></span>'}</a>`;
    }).join('');
    shell('Инструкция Елино', `${ins}
<div class="hero"><small>ООО «Ле Монлид» · Лемана ПРО · Даркстор «Елино»</small><h2>Инструкция для сотрудника склада</h2><small>Сборка заказов · Размещение · Техника · Инлокер · Goodt Time</small>
<div class="pbar"><i style="width:${pct}%"></i></div><div class="row"><span>Изучено ${n} из ${CH.length} глав</span><span>${pct}%</span></div></div>
<div class="sec-t">Главы</div><div class="list">${items}</div>`, { tab: 'learn' });
  }

  function viewChapter(id) {
    const c = chById[id]; if (!c) return go('#/learn');
    const i = CH.indexOf(c), next = CH[i + 1], prev = CH[i - 1];
    const cnt = Q.filter(q => q.c === id).length;
    shell(c.title, `<article class="content">${c.html}</article>
<div class="chap-nav">
<button class="btn" data-act="read" data-id="${id}">${S.read[id] ? '✓ Глава изучена' : 'Отметить как изученную ✓'}</button>
<button class="btn sec" data-act="quiz-ch" data-id="${id}">${isUnlocked() ? `📝 Тест по главе (${cnt} вопр.)` : '🔒 Тест по главе — после обучения'}</button>
<div class="btn-row">${prev ? `<a class="btn ghost" href="#/ch/${prev.id}">‹ Назад</a>` : '<span></span>'}${next ? `<a class="btn ghost" href="#/ch/${next.id}">Далее ›</a>` : '<span></span>'}</div>
</div>`, { tab: 'learn', back: '#/learn', badge: `${i + 1}/${CH.length}` });
  }

  // ---------- Тест
  function viewTest() {
    if (!isUnlocked()) return viewLocked();
    const be = S.best.exam, wrongN = Object.keys(S.wrong).length;
    const tiles = CH.map(c => {
      const n = Q.filter(q => q.c === c.id).length, b = S.best['ch:' + c.id];
      return `<button class="item" data-act="quiz-ch" data-id="${c.id}"><div class="ic">${c.icon}</div><div class="tt"><b>${c.title}</b><span>${n} вопросов</span></div><span class="st">${b != null ? (b >= PASS ? '✅ ' : '') + b + '%' : '—'}</span></button>`;
    }).join('');
    const last = S.hist.slice(-5).reverse().map(h => `<div class="kv"><div class="k" style="font-size:15px;min-width:52px">${h.p}%</div><div class="v">${esc(h.t)}<br><span class="muted small">${new Date(h.d).toLocaleString('ru-RU')}</span></div></div>`).join('');
    const who = S.emp ? `<div class="empcard"><div>👤 Сдаёт: <b>${esc(S.emp.fio)}</b>${S.emp.tab ? `<br><span class="muted small">${esc(S.emp.tab)}</span>` : ''}</div><button class="link" data-act="change-emp">Сменить сотрудника</button></div>`
      : `<button class="empcard empty" data-act="change-emp"><div>👤 <b>Укажи ФИО</b><br><span class="muted small">нужно перед тестом или экзаменом</span></div><span class="link">Ввести ›</span></button>`;
    const pend = SHEETS_URL ? loadQ().filter(r => r.action !== 'coderequest').length : 0;
    shell('Подготовка к экзамену', `${who}${pend ? `<div class="banner">⏳ Не отправлено результатов: ${pend}. Отправятся при появлении интернета.</div>` : ''}
<div class="examcard"><h2>🎓 Экзамен</h2><p>${EXAM_N} случайных вопросов по всем главам. Для сдачи нужно ${PASS}% правильных ответов (не менее ${Math.ceil(EXAM_N * PASS / 100)} из ${EXAM_N}).</p>
<p>Лучший результат: <b>${be != null ? be + '%' : 'ещё не сдавал'}</b></p><button class="btn" data-act="exam">Начать экзамен</button></div>
<div class="grid2" style="margin-top:12px">
<button class="tile" data-act="all"><div class="n">${Q.length}</div><div class="d">Все вопросы подряд (тренировка)</div></button>
<button class="tile" data-act="wrong"><div class="n">${wrongN}</div><div class="d">Работа над ошибками</div></button></div>
<div class="sec-t">Тест по главам</div><div class="list">${tiles}</div>
${last ? `<div class="sec-t">Последние попытки</div><div class="cheat">${last}</div>` : ''}`, { tab: 'test' });
  }

  // ---------- Тесты закрыты: сначала обучение, потом код
  let codeTimer = null;
  function reqState() { // состояние запроса кода для текущего телефона
    const d = curDigits(), r = lsGet(REQKEY, null);
    if (!r || r.p !== d) return null;
    const stillQueued = loadQ().some(x => x.rid === r.rid);
    return { ts: r.ts, state: stillQueued ? 'queued' : 'sent' };
  }
  function viewLocked() {
    const n = studiedN(), total = CH.length;
    if (!chaptersDone()) {
      const first = CH.find(c => !S.read[c.id]), pct = Math.round(n / total * 100);
      shell('Тест', `<div class="lockcard"><div class="lock-ic">🔒</div><h2>Тесты пока закрыты</h2>
<p class="muted">Сначала пройди обучение: отметь все главы как изученные. Шпаргалка и обучение открыты.</p>
<div class="lockprog"><div class="pbar"><i style="width:${pct}%"></i></div><div class="row"><span>Изучено ${n} из ${total} глав</span><span>${pct}%</span></div></div>
<button class="btn" data-go="#/ch/${first.id}">Перейти к главе ${CH.indexOf(first) + 1}: ${esc(first.title)}</button>
<button class="btn ghost" data-go="#/learn">📚 Все главы</button></div>`, { tab: 'test' });
      return;
    }
    if (!S.emp || !curDigits()) {
      shell('Тест', `<div class="lockcard"><div class="lock-ic">🎓</div><h2>Обучение пройдено</h2>
<p class="muted">Чтобы запросить код для тестов, укажи ФИО и номер телефона. Код привязан к твоему номеру.</p>
<button class="btn" data-act="change-emp">👤 Указать ФИО и телефон</button></div>`, { tab: 'test' });
      return;
    }
    shell('Тест', `<div class="lockcard"><div class="lock-ic">🎓</div><h2>Обучение пройдено</h2>
<p class="muted">Запросите код у руководителя. Он пришлёт 4-значный код — введи его ниже, и тесты откроются.</p>
<div class="empcard" style="box-shadow:none;background:var(--bg)"><div>👤 <b>${esc(S.emp.fio)}</b><br><span class="muted small">${esc(S.emp.tab)}</span></div><button class="link" data-act="change-emp">Сменить</button></div>
<button class="btn" id="reqBtn" data-act="req-code">Запросить код</button>
<div id="reqSt"></div>
<label class="fl" for="codeIn">Код от руководителя</label>
<input class="inp code-inp" id="codeIn" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="0000">
<div class="err" id="codeErr"></div>
<button class="btn sec" id="codeBtn" data-act="open-code">🔓 Открыть тесты</button></div>`, { tab: 'test' });
    const inp = $('#codeIn');
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); $('#codeErr').textContent = ''; inp.classList.remove('bad'); });
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); submitCode(); } });
    clearInterval(codeTimer); codeTimer = setInterval(paintCode, 1000); paintCode();
  }
  function paintCode() {
    const btn = $('#reqBtn');
    if (!btn) { clearInterval(codeTimer); codeTimer = null; return; }
    const st = reqState(), left = st ? Math.ceil((st.ts + REQ_COOLDOWN - Date.now()) / 1000) : 0;
    btn.disabled = left > 0;
    btn.textContent = left > 0 ? `Повторить запрос через ${left} с` : (st ? 'Запросить код ещё раз' : 'Запросить код');
    const el = $('#reqSt');
    if (el) el.innerHTML = !st ? '' : st.state === 'queued'
      ? '<div class="sendst st-q">💾 Нет интернета. Запрос сохранён и будет отправлен, когда появится связь. Подключись к интернету.</div>'
      : '<div class="sendst st-ok">✅ Запрос отправлен. Руководитель пришлёт вам код</div>';
    const t = lsGet(TRYKEY, { n: 0, until: 0 }), w = Math.ceil((t.until - Date.now()) / 1000), cb = $('#codeBtn');
    if (cb) { cb.disabled = w > 0; cb.textContent = w > 0 ? `Подожди ${w} с` : '🔓 Открыть тесты'; }
    const ce = $('#codeErr'); if (ce && w > 0 && !ce.textContent.startsWith('Неверный код')) ce.textContent = `Слишком много попыток. Подожди ${w} с.`;
    if (ce && w <= 0 && ce.textContent.startsWith('Слишком')) ce.textContent = '';
  }
  function requestCode() {
    const d = curDigits(); if (!d) return go('#/who');
    if (!SHEETS_URL) return toast('Отправка запроса недоступна в этой версии');
    const prev = reqState();
    if (prev && Date.now() - prev.ts < REQ_COOLDOWN) return paintCode();
    const rec = { action: 'coderequest', rid: 'cr-' + S.dev + '-' + Date.now().toString(36), ts: Date.now(), fio: S.emp.fio, tab: S.emp.tab, device: S.dev };
    const q = loadQ().filter(r => !(r.action === 'coderequest' && r.tab === rec.tab)); q.push(rec); saveQ(q);
    lsSet(REQKEY, { p: d, ts: rec.ts, rid: rec.rid });
    paintCode();
    if (navigator.onLine === false) return;
    flushQueue().then(() => paintCode());
  }
  function submitCode() {
    const d = curDigits(), inp = $('#codeIn'), err = $('#codeErr'); if (!d || !inp) return;
    let t = lsGet(TRYKEY, { n: 0, until: 0 });
    if (t.until > Date.now()) return paintCode();
    if (inp.value.length !== 4) { err.textContent = 'Введи 4 цифры кода'; inp.classList.add('bad'); return; }
    if (inp.value === UL.codeFor(d)) {
      const u = lsGet(ULKEY, {}); u[d] = unlockToken(d); lsSet(ULKEY, u); lsSet(TRYKEY, { n: 0, until: 0 });
      clearInterval(codeTimer); codeTimer = null;
      toast('Тесты открыты ✓'); go('#/test'); return;
    }
    t = { n: (t.n || 0) + 1, until: 0 };
    if (t.n >= MAX_TRIES) { t.until = Date.now() + TRY_WAIT; t.n = 0; }
    lsSet(TRYKEY, t);
    err.textContent = 'Неверный код'; inp.classList.add('bad'); inp.value = '';
    if (navigator.vibrate) navigator.vibrate(60);
    paintCode();
  }

  let pendingStart = null;
  function startQuiz(mode, id) {
    if (!isUnlocked()) return go('#/test');
    if (!S.emp || !normPhone(S.emp.tab)) { pendingStart = [mode, id]; return go('#/who'); }
    let qs, title;
    if (mode === 'exam') {
      // равномерно по главам: минимум 1 вопрос из каждой, остальное случайно
      const pick = []; CH.forEach(c => { const pool = shuffle(Q.filter(q => q.c === c.id)); if (pool.length) pick.push(pool[0]); });
      const rest = shuffle(Q.filter(q => !pick.includes(q)));
      qs = shuffle(pick.concat(rest).slice(0, EXAM_N)); title = 'Экзамен';
    } else if (mode === 'ch') { qs = shuffle(Q.filter(q => q.c === id)); title = 'Тест: ' + chById[id].title; }
    else if (mode === 'wrong') { qs = shuffle(Q.filter(q => S.wrong[q.id])); title = 'Работа над ошибками'; if (!qs.length) return toast('Ошибок нет — отлично! 🎉'); }
    else { qs = shuffle(Q); title = 'Все вопросы'; }
    quiz = { mode, id, title, qs: qs.map(q => ({ ...q, opts: shuffle([q.ok, ...q.bad]) })), i: 0, ans: [], t0: Date.now() };
    go('#/quiz');
  }

  function viewQuiz() {
    if (!quiz || !isUnlocked()) return go('#/test');
    if (quiz.i >= quiz.qs.length) return viewResult();
    const q = quiz.qs[quiz.i], n = quiz.qs.length, a = quiz.ans[quiz.i];
    const L = 'АБВГ';
    const opts = q.opts.map((o, k) => {
      let cls = '';
      if (a) { if (o === q.ok) cls = 'ok'; else if (o === a.pick) cls = 'bad'; else cls = 'dim'; }
      return `<button class="opt ${cls}" data-act="ans" data-k="${k}" ${a ? 'disabled' : ''}><span class="l">${L[k]}</span><span>${esc(o)}</span></button>`;
    }).join('');
    const fb = a ? `<div class="fb ${a.ok ? 'ok' : 'bad'}"><b>${a.ok ? '✅ Верно!' : '❌ Неверно'}</b>${a.ok ? '' : `<div style="margin-bottom:6px">Правильный ответ: <b style="display:inline">${esc(q.ok)}</b></div>`}<div class="q">${esc(q.e)}</div></div>
<button class="btn" data-act="next">${quiz.i + 1 < n ? 'Следующий вопрос →' : 'Показать результат'}</button>
<button class="btn ghost" data-go="#/ch/${q.c}">📖 Открыть главу «${esc(chById[q.c].title)}»</button>` : '';
    const right = quiz.ans.filter(x => x && x.ok).length;
    shell(quiz.title, `<div class="qprog"><span>${quiz.i + 1} / ${n}</span><div class="bar"><i style="width:${(quiz.i + (a ? 1 : 0)) / n * 100}%"></i></div><span>✓ ${right}</span></div>
${empLine()}<div class="qcard"><div class="qchap">${chById[q.c].icon} ${esc(chById[q.c].title)}</div><div class="qtext">${esc(q.q)}</div>${opts}${fb}</div>`,
      { tab: 'test', back: '#/test' });
  }

  function answer(k) {
    const q = quiz.qs[quiz.i]; if (quiz.ans[quiz.i]) return;
    const pick = q.opts[k], ok = pick === q.ok;
    quiz.ans[quiz.i] = { pick, ok };
    if (ok) delete S.wrong[q.id]; else S.wrong[q.id] = 1;
    save(); viewQuiz();
    const fb = $('.fb'); if (fb) fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (navigator.vibrate && !ok) navigator.vibrate(60);
  }

  function viewResult() {
    const n = quiz.qs.length, r = quiz.ans.filter(x => x && x.ok).length, p = Math.round(r / n * 100);
    if (!quiz.saved) {
      quiz.saved = true;
      const key = quiz.mode === 'exam' ? 'exam' : quiz.mode === 'ch' ? 'ch:' + quiz.id : quiz.mode;
      S.best[key] = Math.max(S.best[key] || 0, p);
      S.hist.push({ t: quiz.title, p, d: Date.now(), fio: S.emp && S.emp.fio }); S.hist = S.hist.slice(-30); save();
      const dur = Math.round((Date.now() - quiz.t0) / 1000);
      const wrong = quiz.qs.filter((q, i) => !quiz.ans[i].ok).map(q => q.q);
      quiz.rec = {
        rid: S.dev + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ts: Date.now(), fio: S.emp ? S.emp.fio : '', tab: S.emp ? S.emp.tab : '',
        type: quiz.mode === 'exam' ? 'Экзамен' : quiz.mode === 'ch' ? 'Тест по главе: ' + chById[quiz.id].title : quiz.mode === 'wrong' ? 'Работа над ошибками' : 'Все вопросы',
        correct: r, total: n, percent: p, passed: quiz.mode === 'exam' ? (p >= PASS) : null,
        mistakes: wrong, duration: dur, device: S.dev, app: 'elino-1.1'
      };
      archive(quiz.rec);
      if (SHEETS_URL) {
        quiz.send = 'sending';
        submitResult(quiz.rec).then(ok => { quiz.send = ok ? 'sent' : 'queued'; paintSend(); });
      }
    }
    const pass = p >= PASS, col = pass ? 'var(--g)' : 'var(--red)';
    const mist = quiz.qs.map((q, i) => ({ q, a: quiz.ans[i] })).filter(x => !x.a.ok);
    const ml = mist.map(({ q, a }) => `<div class="mist"><div class="qq">${esc(q.q)}</div><div class="yr">✗ Твой ответ: ${esc(a.pick)}</div><div class="cr">✓ Правильно: ${esc(q.ok)}</div><div class="ex">📖 ${esc(q.e)}</div></div>`).join('');
    const title = quiz.mode === 'exam' ? (pass ? 'Экзамен сдан! 🎉' : 'Экзамен не сдан') : (pass ? 'Отличный результат!' : 'Нужно повторить');
    shell('Результат', `<div class="qcard res"><div class="ring" style="background:conic-gradient(${col} ${p * 3.6}deg,var(--bd) 0)"><span>${p}%<small>${r} из ${n}</small></span></div>
<h2 class="${pass ? 'pass' : 'fail'}">${title}</h2><p class="muted">${quiz.title}. Порог сдачи — ${PASS}%.</p>
${S.emp ? `<p class="res-emp">Сдаёт: <b>${esc(S.emp.fio)}</b>${S.emp.tab ? ` · ${esc(S.emp.tab)}` : ''}<br><span class="muted small">Время: ${fmtDur(quiz.rec.duration)} · ${new Date(quiz.rec.ts).toLocaleString('ru-RU')}</span></p>` : ''}
<div id="sendSt"></div>
<button class="btn" data-act="again">🔄 Пройти ещё раз</button><button class="btn sec" data-go="#/test">К списку тестов</button></div>
${mist.length ? `<div class="sec-t">Разбор ошибок (${mist.length})</div>${ml}` : '<div class="sec-t">Ошибок нет — так держать! 💪</div>'}`, { tab: 'test', back: '#/test' });
    paintSend();
  }

  function viewWho() {
    const e = S.emp || {};
    shell('Кто сдаёт тест?', `<div class="qcard">
<div class="who-ic">👤</div>
<p class="muted" style="margin-top:0">Перед тестом укажи свои данные — результат будет сохранён с твоим именем${SHEETS_URL ? ' и передан руководителю' : ''}.</p>
<div id="whoForm">
<label class="fl">ФИО <span class="req">*</span></label>
<input class="inp" id="fio" name="name" autocomplete="name" autocapitalize="words" placeholder="Иванов Иван Иванович" value="${esc(e.fio || '')}" required>
<div class="err" id="fioErr"></div>
<label class="fl">Номер телефона <span class="req">*</span></label>
<input class="inp" id="tab" name="tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" value="${esc(e.tab || '')}" maxlength="20">
<div class="err" id="tabErr"></div>
<button class="btn" type="button" id="whoBtn">${pendingStart ? 'Сохранить и начать тест' : 'Сохранить'}</button>
</div></div>`, { tab: 'test', back: '#/test' });
    const f = $('#whoForm'), inp = $('#fio');
    inp.addEventListener('input', () => { $('#fioErr').textContent = ''; inp.classList.remove('bad'); });
    $('#tab').addEventListener('input', () => { $('#tabErr').textContent = ''; $('#tab').classList.remove('bad'); });
    const submitWho = ev => {
      if (ev) ev.preventDefault();
      const er = fioError(inp.value);
      if (er) { $('#fioErr').textContent = er; inp.classList.add('bad'); inp.focus(); return; }
      const tel = $('#tab'), pe = phoneError(tel.value);
      if (pe) { $('#tabErr').textContent = pe; tel.classList.add('bad'); tel.focus(); return; }
      S.emp = { fio: normFio(inp.value), tab: normPhone(tel.value) }; save();
      toast('Сотрудник: ' + S.emp.fio);
      if (pendingStart) { const p = pendingStart; pendingStart = null; startQuiz(p[0], p[1]); } else go('#/test');
    };
    $('#whoBtn').addEventListener('click', submitWho);
    f.addEventListener('keydown', ev => { if (ev.key === 'Enter') submitWho(ev); });
  }

  function fmtDur(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function paintSend() {
    const el = $('#sendSt'); if (!el || !quiz) return;
    const m = { sending: ['st-wait', '⏳ Отправка результата…'], sent: ['st-ok', '✅ Результат отправлен'], queued: ['st-q', '💾 Сохранён, отправится при появлении интернета'] }[quiz.send];
    el.innerHTML = m ? `<div class="sendst ${m[0]}">${m[1]}</div>` : '';
  }

  // ---------- Шпаргалка
  function viewCheat() {
    const routes = ['1-1-P', '1-2-P', '1-1-S', '2-A-D-P', '3-A-1-P', '7-1-9-P', '8-1-P', '8-2-P', '8-3-P', 'T-Heavy-P', 'T-Heavy-S', 'T-Long-P', 'T-Mezonin', 'T-Standart'];
    shell('Шпаргалка', `
<div class="cheat"><h3>⏱️ Goodt Time — кратко</h3>
<div class="kv"><div class="k" style="font-size:15px">Сервер</div><div class="v"><code class="copy" data-copy="https://time.lemanapro.ru/api/v1">https://time.lemanapro.ru/api/v1</code> → «Сохранить» → логин/пароль → «Войти»</div></div>
<div class="kv"><div class="k" style="font-size:15px">Приход</div><div class="v">«Начать» → сканирование QR-кода → подтверждение</div></div>
<div class="kv"><div class="k" style="font-size:15px">Перерыв</div><div class="v">«Начать перерыв» → «Да» → QR-код → ждать сообщения → «Завершить перерыв» → QR-код → ждать сообщения</div></div>
<div class="kv"><div class="k" style="font-size:15px">Уход</div><div class="v">«Завершить смену» → QR-код → подтверждение</div></div>
<p class="small muted">QR-код — у входа в зону работы. Нет отметки прихода — смена не зафиксирована; нет отметки ухода — неявка; одна отметка перерыва — ошибки в учёте. Проблемы — сразу к руководителю.</p></div>

<div class="cheat"><h3>🔢 Ключевые цифры и факты</h3>
<div class="kv"><div class="k">30 кг</div><div class="v">Сборка: больше 30 кг — фиксирующий (атлетический) пояс или экзоскелет. Размещение: больше 30 кг — рохля или другое погрузочное оборудование.</div></div>
<div class="kv"><div class="k">1 м</div><div class="v">Товары длиной/высотой более 1 метра — только вдвоём с коллегой.</div></div>
<div class="kv"><div class="k">Грудь</div><div class="v">Товар выше уровня груди — не доставай сам, попроси коллегу.</div></div>
<div class="kv"><div class="k">3</div><div class="v">Категории техники: без допуска (рохля, покупательская тележка) · до 4 кВт (мулинет, поводковый штабелёр — допуск бригадира + инструктаж) · свыше 4 кВт (ричтрак, погрузчик — спецдопуск, обучение, удостоверение).</div></div>
<div class="kv"><div class="k">1000–2000</div><div class="v">кг — обычный максимальный вес рохли (указан на тележке).</div></div>
<div class="kv"><div class="k">2 м</div><div class="v">Поводковый штабелёр — обычно до 2 метров.</div></div>
<div class="kv"><div class="k">8–12 м</div><div class="v">Ричтрак — верхние ярусы стеллажей.</div></div>
<div class="kv"><div class="k">251</div><div class="v">Объект в ТСД при размещении — <b>ДС Елино-251</b>.</div></div>
<div class="kv"><div class="k">SSCC</div><div class="v">Штрихкод, который сканируешь в размещении, затем «Начать».</div></div>
<div class="kv"><div class="k">3–5</div><div class="v">Размещение: после успешного размещения повтори шаги 3–5.</div></div>
<div class="kv"><div class="k">🚫</div><div class="v">Не нажимай «Запомнить меня» — ТСД каждую смену новый.</div></div>
<div class="kv"><div class="k">LKK</div><div class="v">Goodt Time внутри системы (личный кабинет сотрудника).</div></div>
</div>

<div class="cheat"><h3>📦 Сборка — 7 шагов</h3>
<div class="v small">1) Брифинг + ТСД из Инлокера → 2) иконка «СБОРКИ», логин/пароль → 3) ШК таблички маршрута на торце стеллажа, тара → 4) «Приступить к сборке»: ячейка → ШК ячейки → ШК товара → количество → «Сохранить» → 5) QR-код принтера, этикетка → 6) отнести заказ в ячейку с ТСД, ШК ячейки → 7) «Сборка завершена».</div></div>

<div class="cheat"><h3>🏗️ Размещение — 6 шагов</h3>
<div class="v small">1) Брифинг + ТСД → 2) «РАЗМЕЩЕНИЕ», LDAP/пароль, объект ДС Елино-251 → 3) буферная зона, ШК SSCC → «Начать» → 4) ШК товара, пересчёт, едешь к ячейке → 5) ШК ячейки, ставишь (тяжёлое вниз, лёгкое вверх) → 6) повтори шаги 3–5.</div></div>

<div class="cheat"><h3>🗄️ Инлокер — сдать ТСД</h3>
<div class="v small">Бейдж → QR/ШК на ТСД → «Исправен»/«Неисправен» (тип поломки) → подтвердить → первая свободная ячейка → закрыть. На перерыв — «Временное хранение».</div></div>

<div class="cheat" style="border-left:4px solid var(--red)"><h3>🚨 ЧС — порядок действий</h3>
${['Немедленно прекрати работу.', 'Убедись в безопасности себя и окружающих.', 'Оповести руководителя.', 'Вызови помощь по внутреннему каналу связи или телефону.', 'При необходимости эвакуируйся согласно плану эвакуации.'].map((t, i) => `<div class="kv"><span class="pillnum">${i + 1}</span><div class="v">${t}</div></div>`).join('')}
<a class="btn sec" href="#/ch/emergency">План эвакуации</a></div>

<div class="cheat"><h3>🗺️ Маршруты ДС «Елино»</h3><div class="chips">${routes.map(r => `<span class="chip">${r}</span>`).join('')}</div>
<a class="btn sec" href="#/ch/routes">Схема маршрутов</a></div>`, { tab: 'cheat' });
  }

  // ---------- Ещё
  function viewMore() {
    shell('Ещё', `
<div class="inst"><h3>📲 Установка на телефон</h3>
<p class="small muted">${isStandalone() ? '✅ Приложение уже установлено.' : 'После установки иконка появится на главном экране, приложение будет работать без интернета.'}</p>
${deferredPrompt ? '<button class="btn" data-act="install">Установить приложение</button>' : ''}
<b>Android (Chrome):</b><ol><li>Открой ссылку на приложение в Chrome.</li><li>Нажми меню <b>⋮</b> (справа вверху).</li><li>Выбери <b>«Добавить на главный экран»</b> или <b>«Установить приложение»</b>.</li></ol>
<b>iPhone (Safari):</b><ol><li>Открой ссылку в <b>Safari</b>.</li><li>Нажми кнопку <b>«Поделиться»</b> (квадрат со стрелкой вверх).</li><li>Выбери <b>«На экран „Домой“»</b> → «Добавить».</li></ol>
<p class="small muted">Если у тебя файл <b>elino-instrukciya.html</b> — просто открой его в браузере телефона: всё работает офлайн, прогресс сохраняется в этом браузере.</p></div>
<div class="inst"><h3>👤 Сотрудник</h3><p>${S.emp ? `<b>${esc(S.emp.fio)}</b>${S.emp.tab ? '<br>' + esc(S.emp.tab) : ''}` : 'Не указан'}</p><button class="btn sec" data-act="change-emp">${S.emp ? 'Сменить сотрудника' : 'Указать ФИО'}</button>
${SHEETS_URL ? `<p class="small muted">Результаты тестов отправляются руководителю. Не отправлено: ${loadQ().filter(r => r.action !== 'coderequest').length}.</p>` : ''}<p class="small muted">ID устройства: ${S.dev}</p></div>
<div class="inst"><h3>📊 Мой прогресс</h3>
<p>Изучено глав: <b>${CH.filter(c => S.read[c.id]).length} из ${CH.length}</b><br>Лучший результат экзамена: <b>${S.best.exam != null ? S.best.exam + '%' : '—'}</b><br>Вопросов в работе над ошибками: <b>${Object.keys(S.wrong).length}</b></p>
<button class="btn ghost" data-act="reset">Сбросить прогресс</button></div>
<div class="inst"><h3>ℹ️ О приложении</h3><p class="small">Учебное приложение по документу «Инструкция для сотрудника склада» (ООО «Ле Монлид», Лемана ПРО, Даркстор «Елино»), версия документа 1.0. Все правила и вопросы взяты из текста инструкции. При расхождении действует актуальная инструкция и указания бригадира.</p>
<p class="small muted">Банк вопросов: ${Q.length} · Глав: ${CH.length}</p></div>`, { tab: 'more' });
  }

  // ---------- routing
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function route() {
    if (codeTimer) { clearInterval(codeTimer); codeTimer = null; }
    const h = location.hash.replace(/^#\/?/, '');
    const [p, a] = h.split('/');
    if (p === 'ch') viewChapter(a);
    else if (p === 'test') viewTest();
    else if (p === 'quiz') viewQuiz();
    else if (p === 'cheat') viewCheat();
    else if (p === 'more') viewMore();
    else if (p === 'who') viewWho();
    else viewLearn();
  }
  window.addEventListener('hashchange', route);

  document.addEventListener('click', e => {
    const img = e.target.closest('img[data-zoom]');
    if (img) return lightbox(img.src, img.alt);
    const c = e.target.closest('code.copy');
    if (c) { const t = c.dataset.copy; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Скопировано'), () => toast(t)); return; }
    const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); return go(g.dataset.go); }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'read') { S.read[id] = !S.read[id]; save(); if (S.read[id]) { toast(chaptersDone() && !isUnlocked() ? 'Обучение пройдено! Открой вкладку «Тест»' : 'Глава отмечена как изученная ✓'); } viewChapter(id); window.scrollTo(0, document.body.scrollHeight); }
    else if (act === 'quiz-ch') startQuiz('ch', id);
    else if (act === 'exam') startQuiz('exam');
    else if (act === 'all') startQuiz('all');
    else if (act === 'wrong') startQuiz('wrong');
    else if (act === 'ans') answer(+b.dataset.k);
    else if (act === 'next') { quiz.i++; viewQuiz(); }
    else if (act === 'again') startQuiz(quiz.mode, quiz.id);
    else if (act === 'req-code') requestCode();
    else if (act === 'open-code') submitCode();
    else if (act === 'change-emp') { pendingStart = null; go('#/who'); }
    else if (act === 'install' && deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
    else if (act === 'reset') { if (confirm('Сбросить весь прогресс и результаты?')) { S = { read: {}, best: {}, wrong: {}, hist: [], dev: S.dev, emp: S.emp }; save(); viewMore(); toast('Прогресс сброшен'); } }
  });

  function lightbox(src, alt) {
    const d = document.createElement('div'); d.className = 'lb';
    d.innerHTML = `<button class="x" aria-label="Закрыть">✕</button><img src="${src}" alt="${esc(alt)}"><div class="hint">Нажми на изображение — увеличить/уменьшить</div>`;
    d.addEventListener('click', ev => { if (ev.target.tagName === 'IMG') d.classList.toggle('z'); else d.remove(); });
    document.body.appendChild(d);
  }

  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

  if ('serviceWorker' in navigator && !window.ELINO_SINGLE && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }
  route();
  flushQueue();
})();
