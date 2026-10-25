/* Strafenkasse ASV Natz – App (ohne Abhängigkeiten) */
'use strict';
(() => {
  /* ===== Konfiguration ===== */
  // Lesezugriff ist öffentlich. Schreiben erfordert das Admin-Passwort, das NUR im Apps Script geprüft wird.
  const API = 'https://script.google.com/macros/s/AKfycbwuK_OfA5oKJUdypJ0ZhdrabDsxcx4kIHXe0NVzp2gtgajX-RRy958UORCITdaVSzYlvw/exec';
  const API_KEY = '2f1e7b4a9c6d48f8a0d1f3c27e6a9b52';
  const LS = { cache: 'pt_cache_v2', role: 'pt_role', pwd: 'pt_admin' };
  const DAY = 864e5;
  // Spielpausen ohne Strafen – werden in der Prognose herausgerechnet (Monat 0 = Januar)
  const BREAKS = [
    { label: 'Winterpause', from: new Date(2026, 11, 1).getTime(), to: new Date(2027, 0, 18, 23, 59).getTime() }
  ];

  /* ===== Speicher ===== */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  ['pt_api', 'pt_key', 'pt_adm'].forEach(store.del); // Altlasten der alten Version

  /* ===== Zustand ===== */
  const S = {
    data: null,
    role: '',
    pwd: store.get(LS.pwd) || '',
    route: { screen: 'home', arg: '' },
    lastSync: 0, syncing: false, syncError: '',
    busy: false,
    add: { sel: new Set(), fine: '', day: 'heute', date: '', q: '' },
    range: 'saison', pq: '', pfilter: 'alle',
    editFine: '',
    pin: '', pinErr: false
  };
  const savedRole = store.get(LS.role);
  S.role = savedRole === 'admin' && S.pwd ? 'admin' : (savedRole === 'player' || savedRole === 'Spieler') ? 'player' : '';

  /* ===== Hilfsfunktionen ===== */
  const $app = document.getElementById('app');
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const EUR0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur = (n) => EUR.format(n || 0);
  const eur0 = (n) => EUR0.format(Math.round(n || 0));
  const num = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const initials = (n) => { const p = String(n).trim().split(/\s+/); return ((p[0] || '')[0] + ((p[1] || '')[0] || (p[0] || '')[1] || '')).toUpperCase(); };
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  function fmtDay(t) {
    if (!t) return '–';
    const today = startOfDay(Date.now()), d = startOfDay(t);
    if (d === today) return 'heute';
    if (d === today - DAY) return 'gestern';
    const x = new Date(t);
    return WD[x.getDay()] + ', ' + pad(x.getDate()) + '.' + pad(x.getMonth() + 1) + '.' + (x.getFullYear() !== new Date().getFullYear() ? x.getFullYear() : '');
  }
  function season(now = Date.now()) {
    const d = new Date(now);
    const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; // Saison: 1.7. – 30.6.
    return { start: new Date(y, 6, 1).getTime(), end: new Date(y + 1, 5, 30, 23, 59).getTime(), label: 'Saison ' + y + '/' + pad((y + 1) % 100) };
  }

  /* ===== Daten ===== */
  function normalize(d) {
    const rows = (d.rows || []).map((r) => {
      const t = Date.parse(r.ts);
      return { id: String(r.id || ''), name: String(r.name || ''), fine: String(r.fine || '').trim() || 'Ohne Strafenart', amount: num(r.amount), t: Number.isFinite(t) ? t : 0, paid: r.paid === true || String(r.paid).toUpperCase() === 'TRUE' };
    }).filter((r) => r.name);
    rows.sort((a, b) => b.t - a.t);
    return {
      rows,
      players: (d.players || []).map((p) => String(p.name || '')).filter(Boolean),
      fines: (d.fines || []).map((f) => ({ name: String(f.name || ''), amount: num(f.amount) })).filter((f) => f.name),
      at: d.at || ''
    };
  }
  function setData(raw) {
    S.data = normalize(raw);
    S.lastSync = Date.now();
    S.syncError = '';
    store.set(LS.cache, JSON.stringify(raw));
  }
  function playerNames() {
    const set = new Set(S.data ? S.data.players : []);
    if (S.data) S.data.rows.forEach((r) => set.add(r.name));
    return [...set].sort((a, b) => a.localeCompare(b, 'de'));
  }
  function playerStats() {
    const m = new Map();
    playerNames().forEach((n) => m.set(n, { name: n, n: 0, total: 0, open: 0, openIds: [] }));
    (S.data ? S.data.rows : []).forEach((r) => {
      const p = m.get(r.name);
      p.n++; p.total += r.amount;
      if (!r.paid) { p.open += r.amount; p.openIds.push(r.id); }
    });
    return [...m.values()];
  }

  /* ===== API ===== */
  async function fetchT(url, opt = {}, ms = 25000) {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), ms);
    try { return await fetch(url, { ...opt, signal: c.signal }); }
    finally { clearTimeout(timer); }
  }
  const OLD_SCRIPT = 'Apps Script läuft noch in der alten Version – bitte „Neue Version“ bereitstellen';
  const ERR = { unauthorized: 'API-Schlüssel ungültig', forbidden: 'Falscher PIN', locked: 'Zu viele Fehlversuche – Admin-Login für 15 Minuten gesperrt', 'not found': 'Eintrag nicht gefunden', 'unknown action': OLD_SCRIPT };
  const errText = (e) => ERR[e] || String(e || 'Unbekannter Fehler');

  async function apiGet() {
    const r = await fetchT(API + '?apiKey=' + encodeURIComponent(API_KEY) + '&view=all', { cache: 'no-store' });
    if (!r.ok) throw new Error('Server antwortet nicht (' + r.status + ')');
    const j = await r.json();
    if (!j.ok) throw new Error(errText(j.error));
    S.oldScript = !j.at;
    return j;
  }
  async function apiPost(action, body = {}) {
    let j;
    try {
      const r = await fetchT(API + '?action=' + encodeURIComponent(action), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // vermeidet CORS-Preflight
        body: JSON.stringify({ apiKey: API_KEY, adminKey: S.pwd, action, ...body })
      });
      const text = await r.text();
      try { j = JSON.parse(text); }
      catch (_) { throw new Error(OLD_SCRIPT); }
    } catch (e) {
      if (e.message === OLD_SCRIPT) throw e;
      throw new Error(e.name === 'AbortError' ? 'Zeitüberschreitung – bitte erneut versuchen' : 'Keine Verbindung zum Server');
    }
    if (!j.ok) {
      if (j.error === 'forbidden' && action !== 'check_admin') logout(true);
      throw new Error(errText(j.error));
    }
    if (j.data) setData(j.data);
    return j;
  }
  async function refresh(quiet) {
    if (S.syncing) return;
    S.syncing = true;
    try { setData(await apiGet()); }
    catch (e) { S.syncError = e.name === 'AbortError' ? 'Zeitüberschreitung' : (e.message || 'Fehler'); if (!quiet) toast('Laden fehlgeschlagen: ' + S.syncError, true); }
    finally { S.syncing = false; render(); }
  }

  /* ===== Toast ===== */
  let toastEl = null, toastTimer = 0;
  function toast(msg, isErr) {
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    toastEl = document.createElement('div');
    toastEl.className = 'toast' + (isErr ? ' err' : '');
    toastEl.setAttribute('role', isErr ? 'alert' : 'status');
    toastEl.innerHTML = (isErr ? '' : I.check) + '<span>' + esc(msg) + '</span>';
    document.body.appendChild(toastEl);
    toastTimer = setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, isErr ? 4500 : 2600);
  }

  /* ===== Icons ===== */
  const svg = (p, s = 22, w = 2) => '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const I = {
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    stats: svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
    plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>', 26, 2.6),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2.2.6 3.5 2.8 3.5 6"/>'),
    more: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    trend: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    chev: svg('<path d="M9 6l6 6-6 6"/>', 18),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 18),
    x: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', 18)
  };

  /* ===== Routing (Hash → Zurück-Taste funktioniert) ===== */
  function parseHash() {
    const [screen, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    return { screen: screen || 'home', arg: decodeURIComponent(rest.join('/') || '') };
  }
  function go(screen, arg, replace) {
    const h = '#/' + screen + (arg ? '/' + encodeURIComponent(arg) : '');
    if (location.hash === h) { render(); return; }
    if (replace) location.replace(h); else location.hash = h;
  }
  window.addEventListener('hashchange', () => {
    const prev = S.route.screen + S.route.arg;
    S.route = parseHash();
    render();
    if (prev !== S.route.screen + S.route.arg) window.scrollTo(0, 0);
  });

  /* ===== Bausteine ===== */
  const isAdmin = () => S.role === 'admin';
  const skeleton = () => '<div class="skel"></div><div class="skel" style="min-height:160px"></div><div class="skel"></div>';
  const empty = (t) => '<div class="empty">' + esc(t) + '</div>';
  const back = (label = 'Zurück') => '<button type="button" data-a="back">' + esc(label) + '</button>';
  function header() {
    return '<header class="top"><img src="assets/logo-96.webp" width="44" height="44" alt="ASV Natz Logo">' +
      '<div class="t"><span class="eyebrow">ASV Natz</span><span class="title">Strafenkasse</span></div>' +
      '<button type="button" class="chip" data-a="go" data-s="more">' + (isAdmin() ? 'Admin' : 'Spieler') + '</button></header>';
  }
  function syncLine() {
    if (S.syncing) return '<p class="sync">Aktualisiere …</p>';
    if (S.syncError) return '<p class="sync">Offline-Stand · <button type="button" class="link" data-a="refresh">Erneut laden</button></p>';
    if (!S.lastSync) return '';
    const d = new Date(S.lastSync);
    return '<p class="sync">Stand ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' Uhr</p>';
  }
  function entryItem(r, withName) {
    return '<button type="button" class="item" data-a="go" data-s="player" data-arg="' + esc(r.name) + '">' +
      '<span class="main"><b>' + esc(withName ? r.name : r.fine) + '</b><span class="sub">' + esc(withName ? r.fine + ' · ' : '') + fmtDay(r.t) + '</span></span>' +
      '<span class="amt">' + eur(r.amount) + '</span></button>';
  }
  function sparkline(rows) {
    if (rows.length < 2) return '';
    const asc = rows.slice().sort((a, b) => a.t - b.t);
    const t0 = asc[0].t, t1 = Math.max(Date.now(), t0 + DAY), N = 40, vals = [];
    let i = 0, run = 0;
    for (let k = 0; k <= N; k++) {
      const tk = t0 + (t1 - t0) * k / N;
      while (i < asc.length && asc[i].t <= tk) run += asc[i++].amount;
      vals.push(run);
    }
    const max = Math.max(...vals) || 1;
    const pts = vals.map((v, k) => (k * 300 / N).toFixed(1) + ',' + (54 - v / max * 50).toFixed(1));
    return '<svg class="chart" viewBox="0 0 300 56" preserveAspectRatio="none" height="56" aria-hidden="true">' +
      '<path d="M' + pts.join(' L') + ' L300,56 L0,56 Z" fill="var(--accent)" fill-opacity=".12"/>' +
      '<path d="M' + pts.join(' L') + '" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>';
  }

  /* ===== Prognose ===== */
  // Tage zwischen a und b ohne Spielpausen
  function activeDays(a, b) {
    let d = Math.max(0, b - a);
    BREAKS.forEach((p) => { d -= Math.max(0, Math.min(b, p.to) - Math.max(a, p.from)); });
    return d / DAY;
  }
  function forecast(rows, now = Date.now()) {
    const se = season(now);
    const inSeason = rows.filter((r) => r.t >= se.start && r.t <= now);
    const total = sum(inSeason, (r) => r.amount);
    const elapsed = activeDays(se.start, now);
    if (elapsed < 7 || !inSeason.length) return null;
    // Wochensummen der letzten 8 Spielwochen (Wochen in einer Pause zählen nicht)
    const weeks = [];
    for (let w = 0, to = now; weeks.length < 8 && w < 30; w++, to -= 7 * DAY) {
      const from = to - 7 * DAY;
      if (from < se.start) break;
      if (activeDays(from, to) < 3.5) continue;
      weeks.push(sum(inSeason.filter((r) => r.t > from && r.t <= to), (r) => r.amount));
    }
    const rate = weeks.length >= 2 ? sum(weeks, (x) => x) / weeks.length : total / elapsed * 7;
    const sd = weeks.length >= 2 ? Math.sqrt(sum(weeks, (x) => (x - rate) ** 2) / (weeks.length - 1)) : rate * 0.5;
    const remW = activeDays(now, se.end) / 7;
    const value = total + rate * remW;
    const spread = sd * Math.sqrt(remW);
    // Verlauf der Prognose: flach während einer Pause
    const path = [[now, total]];
    BREAKS.filter((p) => p.to > now && p.from < se.end).sort((a, b) => a.from - b.from).forEach((p) => {
      const a = Math.max(now, p.from), b = Math.min(se.end, p.to);
      path.push([a, total + rate * activeDays(now, a) / 7], [b, total + rate * activeDays(now, b) / 7]);
    });
    path.push([se.end, value]);
    const breaks = BREAKS.filter((p) => p.to > se.start && p.from < se.end);
    const r10 = (x) => Math.round(x / 10) * 10;
    return { season: se, total, rate, weeks: weeks.length, path, breaks, value: r10(value), lo: r10(Math.max(total, value - spread)), hi: r10(value + spread) };
  }

  /* ===== Diagramm (SVG, ohne Bibliothek) ===== */
  function chart(rows, from, to, fc) {
    const W = 340, H = 190, L = 54, R = 10, T = 12, B = 26;
    const now = Date.now(), end = Math.min(now, to);
    const asc = rows.filter((r) => r.t >= from && r.t <= end).sort((a, b) => a.t - b.t);
    const pts = [];
    let i = 0, run = 0;
    for (let d = startOfDay(from); d <= end; d += DAY) {
      const de = d + DAY;
      while (i < asc.length && asc[i].t < de) run += asc[i++].amount;
      pts.push([Math.min(de, end), run]);
    }
    if (!pts.length) pts.push([end, 0]);
    const maxRaw = Math.max(run, fc ? fc.hi : 0, 10);
    const step = niceStep(maxRaw / 3);
    const max = Math.ceil(maxRaw / step) * step;
    const x = (t) => L + (t - from) / Math.max(to - from, 1) * (W - L - R);
    const y = (v) => T + (1 - v / max) * (H - T - B);
    let g = '';
    for (let v = 0; v <= max + 1e-6; v += step) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="#1C2430"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(eur0(v)) + '</text>';
    }
    // Monatsbeschriftung
    const md = new Date(from); md.setDate(1); md.setHours(0, 0, 0, 0);
    let lastX = -99;
    const months = [];
    for (; md.getTime() <= to; md.setMonth(md.getMonth() + 1)) months.push(md.getTime());
    const every = Math.max(1, Math.ceil(months.length / 7));
    months.forEach((t, k) => {
      if (t < from || k % every) return;
      const xx = x(t);
      if (xx - lastX < 30 || xx > W - R - 12) return;
      lastX = xx;
      g += '<text x="' + xx.toFixed(1) + '" y="' + (H - 6) + '">' + MON[new Date(t).getMonth()] + '</text>';
    });
    const line = pts.map((p, k) => (k ? 'L' : 'M') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' ');
    const lx = x(pts[pts.length - 1][0]), ly = y(run);
    let f = '';
    if (fc) {
      fc.breaks.forEach((p) => {
        const a = x(Math.max(from, p.from)), b = x(Math.min(to, p.to));
        if (b - a < 2) return;
        f += '<rect x="' + a.toFixed(1) + '" y="' + T + '" width="' + (b - a).toFixed(1) + '" height="' + (H - T - B) + '" fill="#1C2430" fill-opacity=".55"/>' +
          '<text x="' + ((a + b) / 2).toFixed(1) + '" y="' + (T + 12) + '" text-anchor="middle" font-size="10">Pause</text>';
      });
      // Spanne proportional zum Prognose-Zuwachs
      const grow = Math.max(fc.value - fc.total, 1);
      const at = (v, edge) => fc.total + (v - fc.total) * (edge - fc.total) / grow;
      const P = fc.path.map(([t, v]) => [x(t), v]);
      const up = P.map(([xx, v]) => xx.toFixed(1) + ',' + y(at(v, fc.hi)).toFixed(1));
      const lo = P.slice().reverse().map(([xx, v]) => xx.toFixed(1) + ',' + y(at(v, fc.lo)).toFixed(1));
      f += '<polygon points="' + up.concat(lo).join(' ') + '" fill="var(--accent)" fill-opacity=".1"/>' +
        '<path d="' + P.map(([xx, v], k) => (k ? 'L' : 'M') + xx.toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 5" fill="none"/>';
    }
    const label = 'Kumulierter Verlauf: ' + eur(run) + (fc ? ', Prognose ' + eur0(fc.value) : '');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">' + g + f +
      '<path d="' + line + ' L' + lx.toFixed(1) + ',' + y(0).toFixed(1) + ' L' + x(pts[0][0]).toFixed(1) + ',' + y(0).toFixed(1) + ' Z" fill="var(--accent)" fill-opacity=".16"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="4.5" fill="var(--bg)" stroke="var(--accent)" stroke-width="2.5"/></svg>';
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1))));
    const m = x / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function bars(list) {
    if (!list.length) return empty('Keine Daten');
    const max = Math.max(...list.map((b) => b.v)) || 1;
    return '<div class="bars">' + list.map((b) =>
      '<div class="bar-row"><div class="l"><span>' + esc(b.label) + '</span><span>' + esc(b.text) + '</span></div>' +
      '<div class="bar-track"><i style="width:' + Math.max(2, b.v / max * 100).toFixed(1) + '%"></i></div></div>').join('') + '</div>';
  }

  /* ===== Screens ===== */
  function viewLogin() {
    return '<div class="login">' +
      '<div><img class="logo" src="assets/logo-192.png" width="96" height="96" alt="ASV Natz Logo"><h1 style="margin-top:16px">Strafenkasse</h1><p class="muted">ASV Natz</p></div>' +
      '<button type="button" class="btn primary" data-a="asPlayer">Als Spieler ansehen</button>' +
      '<div class="divider">oder</div>' + loginForm() + '</div>';
  }
  function loginForm() {
    const dots = [0, 1, 2, 3].map((i) => '<i' + (i < S.pin.length ? ' class="on"' : '') + '></i>').join('');
    const key = (d) => '<button type="button" data-a="pin" data-v="' + d + '"' + (S.busy ? ' disabled' : '') + '>' + d + '</button>';
    return '<div class="pinpad' + (S.pinErr ? ' err' : '') + '"><span class="label" style="text-align:center">' + (S.busy ? 'Prüfe …' : 'Admin-PIN') + '</span>' +
      '<div class="dots" role="status" aria-label="' + S.pin.length + ' von 4 Ziffern">' + dots + '</div>' +
      '<div class="keys">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('') + '<span></span>' + key(0) +
      '<button type="button" data-a="pinDel" aria-label="Löschen"' + (S.busy ? ' disabled' : '') + '>⌫</button></div></div>';
  }

  function viewHome() {
    if (!S.data) return header() + skeleton();
    const rows = S.data.rows;
    const total = sum(rows, (r) => r.amount), open = sum(rows.filter((r) => !r.paid), (r) => r.amount), paid = total - open;
    const week = sum(rows.filter((r) => r.t > Date.now() - 7 * DAY), (r) => r.amount);
    const fc = forecast(rows);
    const top = playerStats().filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
    return header() +
      '<section class="card lg" aria-label="Kassenstand">' +
        '<div class="sec-head"><span class="muted" style="font-size:13px">Strafen gesamt · ' + rows.length + ' Einträge</span>' + (week ? '<span class="delta">+' + eur(week) + ' in 7 Tagen</span>' : '') + '</div>' +
        '<span class="big">' + eur(total) + '</span>' + sparkline(rows) +
        '<div class="progress" role="img" aria-label="' + Math.round(total ? paid / total * 100 : 0) + ' Prozent bezahlt"><i style="width:' + (total ? paid / total * 100 : 0).toFixed(1) + '%"></i></div>' +
        '<div class="grid2"><div class="stat"><span>Bezahlt</span><b>' + eur(paid) + '</b></div><div class="stat"><span>Noch offen</span><b class="warn">' + eur(open) + '</b></div></div>' +
      '</section>' +
      '<button type="button" class="card teaser" data-a="go" data-s="stats">' + I.trend +
        '<span class="main"><small>' + (fc ? 'Prognose ' + esc(fc.season.label) : 'Auswertung') + '</small><b>' + (fc ? 'ca. ' + eur0(fc.value) + ' <span class="muted" style="font-weight:500;font-size:13px">(' + eur0(fc.lo) + '–' + eur0(fc.hi) + ')</span>' : 'Verlauf & Statistiken') + '</b></span>' +
        '<span class="muted">' + I.chev + '</span></button>' +
      '<section style="display:flex;flex-direction:column;gap:10px"><div class="sec-head"><h2 class="h2">Top-Sünder</h2><span class="muted" style="font-size:13px">gesamt</span></div>' +
        '<div class="list">' + (top.length ? top.map((p, k) =>
          '<button type="button" class="item" data-a="go" data-s="player" data-arg="' + esc(p.name) + '"><span class="rank">' + (k + 1) + '</span><span class="avatar">' + esc(initials(p.name)) + '</span>' +
          '<span class="main"><b>' + esc(p.name) + '</b><span class="sub">' + p.n + (p.n === 1 ? ' Strafe' : ' Strafen') + '</span></span><span class="amt">' + eur(p.total) + '</span></button>').join('') : empty('Noch keine Strafen')) + '</div></section>' +
      '<section style="display:flex;flex-direction:column;gap:10px"><div class="sec-head"><h2 class="h2">Letzte Einträge</h2><button type="button" class="link" data-a="go" data-s="players">Alle Spieler</button></div>' +
        '<div class="list">' + (rows.length ? rows.slice(0, 5).map((r) => entryItem(r, true)).join('') : empty('Noch keine Einträge')) + '</div></section>' +
      syncLine();
  }

  function viewStats() {
    const head = '<h1 class="h1">Auswertung</h1>' +
      '<div class="seg" role="group" aria-label="Zeitraum">' + [['4w', '4 Wochen'], ['saison', 'Saison'], ['gesamt', 'Gesamt']].map(([k, l]) =>
        '<button type="button" data-a="range" data-v="' + k + '" aria-pressed="' + (S.range === k) + '">' + l + '</button>').join('') + '</div>';
    if (!S.data) return head + skeleton();
    const all = S.data.rows, now = Date.now(), se = season(now);
    let from, to;
    if (S.range === '4w') { from = startOfDay(now - 27 * DAY); to = now; }
    else if (S.range === 'saison') { from = se.start; to = se.end; }
    else { from = all.length ? startOfDay(Math.min(...all.map((r) => r.t))) : startOfDay(now); to = now; }
    const rows = all.filter((r) => r.t >= from && r.t <= now);
    const fc = S.range === 'saison' ? forecast(all, now) : null;
    const total = sum(rows, (r) => r.amount);
    const weeks = Math.max(1, (Math.min(now, to) - from) / (7 * DAY));
    const people = new Set(rows.map((r) => r.name)).size;
    const wd = [0, 0, 0, 0, 0, 0, 0]; rows.forEach((r) => { wd[new Date(r.t).getDay()]++; });
    const topWd = rows.length ? WD_LONG[wd.indexOf(Math.max(...wd))] : '–';

    const byFine = new Map(); rows.forEach((r) => { const x = byFine.get(r.fine) || { n: 0, s: 0 }; x.n++; x.s += r.amount; byFine.set(r.fine, x); });
    const fineBars = [...byFine].sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([k, x]) => ({ label: k, v: x.n, text: x.n + '× · ' + eur0(x.s) }));
    const byP = new Map(); rows.forEach((r) => byP.set(r.name, (byP.get(r.name) || 0) + r.amount));
    const pBars = [...byP].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ label: k, v, text: eur(v) }));

    const title = S.range === 'saison' ? 'Kasse & Prognose' : 'Kassenverlauf';
    const sub = S.range === 'saison' ? se.label : S.range === '4w' ? 'letzte 28 Tage' : 'seit Beginn';
    let note = '';
    if (S.range === 'saison') {
      note = fc
        ? '<p class="note">Bei aktuellem Tempo (ca. ' + eur0(fc.rate) + ' pro Woche) landet die Kasse am Saisonende (30.06.) bei <b>ca. ' + eur0(fc.value) + '</b>, wahrscheinlich zwischen ' + eur0(fc.lo) + ' und ' + eur0(fc.hi) + '. Basis: ' + (fc.weeks >= 2 ? 'die letzten ' + fc.weeks + ' Spielwochen' : 'der bisherige Saisonschnitt') + '.' + (fc.breaks.length ? ' ' + fc.breaks.map((p) => esc(p.label) + ' ' + pad(new Date(p.from).getDate()) + '.' + pad(new Date(p.from).getMonth() + 1) + '.–' + pad(new Date(p.to).getDate()) + '.' + pad(new Date(p.to).getMonth() + 1) + '.').join(', ') + ' ist eingerechnet.' : '') + '</p>'
        : '<p class="note">Für eine Prognose braucht es mindestens eine Woche mit Einträgen in dieser Saison.</p>';
    }
    return head +
      '<section class="card lg"><div class="sec-head"><b>' + title + '</b><span class="muted" style="font-size:12px">' + esc(sub) + '</span></div>' +
        (rows.length || fc ? chart(all, from, to, fc) : empty('Keine Einträge in diesem Zeitraum')) +
        '<div class="legend"><span><i></i>Ist</span>' + (fc ? '<span><i class="dash"></i>Prognose</span><span><i class="band"></i>Spanne</span>' : '') + '</div>' + note + '</section>' +
      '<div class="grid2">' +
        '<div class="kpi"><span>Summe</span><b>' + eur(total) + '</b></div>' +
        '<div class="kpi"><span>Ø pro Woche</span><b>' + eur(total / weeks) + '</b></div>' +
        '<div class="kpi"><span>Ø pro Spieler</span><b>' + eur(people ? total / people : 0) + '</b></div>' +
        '<div class="kpi"><span>Häufigster Tag</span><b>' + topWd + '</b></div>' +
      '</div>' +
      '<section class="card lg"><b>Häufigste Vergehen</b>' + bars(fineBars) + '</section>' +
      '<section class="card lg"><b>Spieler-Ranking</b>' + bars(pBars) + '</section>';
  }

  function viewPlayers() {
    const head = '<h1 class="h1">Spieler</h1>' +
      '<label class="field">' + '<span class="muted">' + I.search + '</span><input id="pq" type="search" data-in="pq" value="' + esc(S.pq) + '" placeholder="Spieler suchen" aria-label="Spieler suchen" autocomplete="off"></label>' +
      '<div class="pills" role="group" aria-label="Filter">' + [['alle', 'Alle'], ['offen', 'Nur offene']].map(([k, l]) =>
        '<button type="button" data-a="pfilter" data-v="' + k + '" aria-pressed="' + (S.pfilter === k) + '">' + l + '</button>').join('') + '</div>';
    if (!S.data) return head + skeleton();
    const q = S.pq.trim().toLowerCase();
    const list = playerStats()
      .filter((p) => (!q || p.name.toLowerCase().includes(q)) && (S.pfilter === 'alle' || p.open > 0))
      .sort((a, b) => S.pfilter === 'offen' ? b.open - a.open : b.total - a.total || a.name.localeCompare(b.name, 'de'));
    const openSum = sum(list, (p) => p.open);
    return head +
      (S.pfilter === 'offen' && list.length ? '<p class="muted" style="margin:0;font-size:13px">' + list.length + ' Spieler · zusammen ' + eur(openSum) + ' offen</p>' : '') +
      '<div class="list">' + (list.length ? list.map((p) =>
        '<button type="button" class="item" data-a="go" data-s="player" data-arg="' + esc(p.name) + '"><span class="avatar">' + esc(initials(p.name)) + '</span>' +
        '<span class="main"><b>' + esc(p.name) + '</b><span class="sub">' + p.n + (p.n === 1 ? ' Strafe' : ' Strafen') + ' · gesamt ' + eur(p.total) + '</span></span>' +
        (p.open > 0 ? '<span class="pill open">offen ' + eur(p.open) + '</span>' : p.n ? '<span class="pill paid">bezahlt</span>' : '') + '</button>').join('')
        : empty(q ? 'Kein Spieler gefunden' : 'Alle haben bezahlt')) + '</div>';
  }

  function viewPlayer(name) {
    const head = '<div class="sheet-head">' + back() + '<span class="h2">' + esc(name) + '</span><span style="min-width:70px"></span></div>';
    if (!S.data) return head + skeleton();
    const rows = S.data.rows.filter((r) => r.name === name);
    const total = sum(rows, (r) => r.amount), openRows = rows.filter((r) => !r.paid), open = sum(openRows, (r) => r.amount);
    return head +
      '<section class="card lg"><div class="grid2"><div class="stat"><span>Gesamt</span><b>' + eur(total) + '</b></div><div class="stat"><span>Noch offen</span><b class="warn">' + eur(open) + '</b></div></div>' +
        (isAdmin() && open > 0 ? '<button type="button" class="btn primary sm" data-a="payAll" data-arg="' + esc(name) + '">Alles bezahlt · ' + eur(open) + '</button>' : '') + '</section>' +
      '<h2 class="h2">Strafen</h2>' +
      '<div class="list">' + (rows.length ? rows.map((r) =>
        '<div class="item"><span class="main"><b>' + esc(r.fine) + '</b><span class="sub">' + fmtDay(r.t) + ' · ' + eur(r.amount) + '</span></span>' +
        (isAdmin()
          ? '<button type="button" class="pill ' + (r.paid ? 'paid' : 'open') + '" data-a="togglePaid" data-id="' + esc(r.id) + '" aria-label="' + (r.paid ? 'Als offen markieren' : 'Als bezahlt markieren') + '">' + (r.paid ? 'bezahlt' : 'offen') + '</button>' +
            '<button type="button" class="chip" style="padding:10px" data-a="delEntry" data-id="' + esc(r.id) + '" aria-label="Eintrag löschen">' + I.x + '</button>'
          : '<span class="pill ' + (r.paid ? 'paid' : 'open') + '">' + (r.paid ? 'bezahlt' : 'offen') + '</span>') +
        '</div>').join('') : empty('Keine Strafen – vorbildlich!')) + '</div>' +
      (isAdmin() ? '<p class="sync">Tippe auf „offen“/„bezahlt“, um den Status zu ändern.</p>' : '');
  }

  function viewAdd() {
    if (!isAdmin()) return viewLogin();
    const A = S.add;
    const head = '<div class="sheet-head">' + back('Abbrechen') + '<span class="h2">Strafe erfassen</span><span style="min-width:70px"></span></div>';
    if (!S.data) return head + skeleton();
    const names = playerNames();
    const q = A.q.trim().toLowerCase();
    const shown = names.filter((n) => !q || n.toLowerCase().includes(q) || A.sel.has(n));
    const fines = S.data.fines.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return head +
      '<section style="display:flex;flex-direction:column;gap:10px"><div class="sec-head"><span class="label">1 · Wer?</span><span class="delta">' + A.sel.size + ' ausgewählt</span></div>' +
        (names.length > 12 ? '<label class="field"><span class="muted">' + I.search + '</span><input id="aq" type="search" data-in="aq" value="' + esc(A.q) + '" placeholder="Name filtern" aria-label="Name filtern" autocomplete="off"></label>' : '') +
        (names.length ? '<div class="chips">' + shown.map((n) => '<button type="button" data-a="pick" data-arg="' + esc(n) + '" aria-pressed="' + A.sel.has(n) + '">' + esc(n) + '</button>').join('') + '</div>'
          : empty('Noch keine Spieler – unter „Mehr → Kader“ anlegen')) + '</section>' +
      '<section style="display:flex;flex-direction:column;gap:10px"><span class="label">2 · Was?</span>' +
        (fines.length ? '<div class="tiles">' + fines.map((f) => '<button type="button" data-a="fine" data-arg="' + esc(f.name) + '" aria-pressed="' + (A.fine === f.name) + '"><span>' + esc(f.name) + '</span><b>' + eur(f.amount) + '</b></button>').join('') + '</div>'
          : empty('Noch keine Strafen – unter „Mehr → Strafenkatalog“ anlegen')) + '</section>' +
      '<section style="display:flex;flex-direction:column;gap:10px"><span class="label">3 · Wann?</span>' +
        '<div class="pills">' + [['heute', 'Heute'], ['gestern', 'Gestern'], ['datum', 'Datum …']].map(([k, l]) =>
          '<button type="button" data-a="day" data-v="' + k + '" aria-pressed="' + (A.day === k) + '">' + l + '</button>').join('') + '</div>' +
        (A.day === 'datum' ? '<label class="field"><input id="adate" type="date" data-in="adate" value="' + esc(A.date || ymd(Date.now())) + '" max="' + ymd(Date.now()) + '" aria-label="Datum"></label>' : '') +
      '</section>';
  }
  function addBar() {
    const A = S.add, fine = S.data && S.data.fines.find((f) => f.name === A.fine);
    const total = A.sel.size * (fine ? fine.amount : 0);
    const ok = A.sel.size > 0 && !!fine && !S.busy;
    const label = !A.sel.size ? 'Spieler auswählen' : !fine ? 'Strafe auswählen' : 'Speichern · ' + eur(total);
    return '<div class="actionbar"><div><div class="sum"><span>' + A.sel.size + ' × ' + esc(fine ? fine.name : '–') + '</span><b>' + eur(total) + '</b></div>' +
      '<button type="button" class="btn primary" data-a="saveAdd"' + (ok ? '' : ' disabled') + '>' + label + '</button></div></div>';
  }

  function viewMore() {
    const d = S.data;
    let h = '<h1 class="h1">Mehr</h1>';
    if (isAdmin()) {
      h += '<span class="label">Verwaltung</span><div class="list">' +
        moreItem('go', 'catalog', 'Strafenkatalog', d ? d.fines.length + ' Vergehen und Beträge' : 'Vergehen und Beträge') +
        moreItem('go', 'squad', 'Kader', d ? playerNames().length + ' Spieler' : 'Spieler verwalten') +
        moreItem('go', 'players', 'Zahlungen', 'Offene Beträge als bezahlt markieren') + '</div>';
    } else {
      h += '<span class="label">Admin-Zugang</span><div class="card">' + loginForm() + '</div>';
      if (S.oldScript) h += '<p class="note" style="color:var(--warn)">Hinweis: ' + esc(OLD_SCRIPT) + '. Erst dann funktioniert die Admin-Anmeldung.</p>';
    }
    h += '<span class="label">Daten</span><div class="list">' +
      moreItem('export', '', 'Export als CSV', 'Für Excel, mit allen Einträgen') +
      moreItem('refresh', '', 'Jetzt aktualisieren', S.lastSync ? 'Zuletzt ' + new Date(S.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'Daten neu laden') + '</div>' +
      '<span class="label">Konto</span><div class="list">' +
      '<button type="button" class="item" data-a="logout"><span class="main"><b style="color:var(--danger)">' + (isAdmin() ? 'Abmelden' : 'Rolle wechseln') + '</b></span></button></div>' +
      '<p class="sync">Tipp: Im Browser-Menü „Zum Home-Bildschirm“ wählen – dann startet die Strafenkasse wie eine App.</p>';
    return h;
  }
  const moreItem = (a, s, title, sub) => '<button type="button" class="item" data-a="' + a + '"' + (s ? ' data-s="' + s + '"' : '') + '><span class="main"><b>' + esc(title) + '</b><span class="sub">' + esc(sub) + '</span></span><span class="muted">' + I.chev + '</span></button>';

  function viewCatalog() {
    if (!isAdmin()) return viewMore();
    const fines = S.data ? S.data.fines.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')) : [];
    const cur = fines.find((f) => f.name === S.editFine);
    return '<div class="sheet-head">' + back() + '<span class="h2">Strafenkatalog</span><span style="min-width:70px"></span></div>' +
      '<form class="card lg" data-form="fine"><b>' + (cur ? 'Strafe bearbeiten' : 'Neue Strafe') + '</b>' +
        '<label class="field"><input id="fname" placeholder="Vergehen, z. B. Zu spät" aria-label="Vergehen" required value="' + esc(cur ? cur.name : '') + '"' + (cur ? ' readonly' : '') + '></label>' +
        '<label class="field"><input id="famount" inputmode="decimal" placeholder="Betrag in €" aria-label="Betrag in Euro" required value="' + (cur ? String(cur.amount).replace('.', ',') : '') + '"><span class="muted">€</span></label>' +
        '<div class="row">' + (cur ? '<button type="button" class="btn ghost sm" style="flex:1" data-a="editFine" data-arg="">Abbrechen</button>' : '') +
        '<button type="submit" class="btn primary sm" style="flex:1"' + (S.busy ? ' disabled' : '') + '>Speichern</button></div></form>' +
      '<div class="list">' + (fines.length ? fines.map((f) =>
        '<div class="item"><button type="button" class="main" style="background:none;border:0;padding:0;text-align:left" data-a="editFine" data-arg="' + esc(f.name) + '"><b>' + esc(f.name) + '</b><span class="sub">' + eur(f.amount) + ' · zum Bearbeiten tippen</span></button>' +
        '<button type="button" class="chip" style="padding:10px" data-a="delFine" data-arg="' + esc(f.name) + '" aria-label="' + esc(f.name) + ' löschen">' + I.x + '</button></div>').join('') : empty('Noch keine Strafen')) + '</div>';
  }

  function viewSquad() {
    if (!isAdmin()) return viewMore();
    const names = S.data ? S.data.players.slice().sort((a, b) => a.localeCompare(b, 'de')) : [];
    return '<div class="sheet-head">' + back() + '<span class="h2">Kader</span><span style="min-width:70px"></span></div>' +
      '<form class="row" data-form="player"><label class="field"><input id="pname" placeholder="Neuer Spieler" aria-label="Name des Spielers" required autocomplete="off"></label>' +
      '<button type="submit" class="btn primary sm"' + (S.busy ? ' disabled' : '') + '>Hinzufügen</button></form>' +
      '<div class="list">' + (names.length ? names.map((n) =>
        '<div class="item"><span class="avatar">' + esc(initials(n)) + '</span><span class="main"><b>' + esc(n) + '</b></span>' +
        '<button type="button" class="chip" style="padding:10px" data-a="delPlayer" data-arg="' + esc(n) + '" aria-label="' + esc(n) + ' entfernen">' + I.x + '</button></div>').join('') : empty('Noch keine Spieler')) + '</div>' +
      '<p class="sync">Bereits erfasste Strafen bleiben erhalten, wenn ein Spieler entfernt wird.</p>';
  }

  function nav(screen) {
    const b = (s, label, icon, cur) => '<button type="button" data-a="go" data-s="' + s + '"' + (cur ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></button>';
    const top = { home: 'home', stats: 'stats', players: 'players', player: 'players', more: 'more', catalog: 'more', squad: 'more' }[screen];
    return '<nav class="nav" aria-label="Hauptnavigation"><div>' +
      b('home', 'Übersicht', I.home, top === 'home') + b('stats', 'Auswertung', I.stats, top === 'stats') +
      '<button type="button" class="fab" data-a="add" aria-label="Strafe erfassen">' + I.plus + '</button>' +
      b('players', 'Spieler', I.users, top === 'players') + b('more', 'Mehr', I.more, top === 'more') + '</div></nav>';
  }

  /* ===== Render ===== */
  function render() {
    const active = document.activeElement;
    const focusId = active && active.id, caret = active && active.selectionStart;
    if (!S.role) { $app.innerHTML = viewLogin(); restore(focusId, caret); return; }
    const { screen, arg } = S.route;
    let body, withNav = true;
    switch (screen) {
      case 'stats': body = viewStats(); break;
      case 'players': body = viewPlayers(); break;
      case 'player': body = viewPlayer(arg); break;
      case 'more': body = viewMore(); break;
      case 'catalog': body = viewCatalog(); break;
      case 'squad': body = viewSquad(); break;
      case 'add': body = viewAdd(); withNav = !isAdmin(); break;
      default: body = viewHome();
    }
    $app.innerHTML = '<main class="view' + (withNav ? '' : ' no-nav') + '">' + body + '</main>' + (withNav ? nav(screen) : (S.data ? addBar() : ''));
    restore(focusId, caret);
  }
  function restore(id, caret) {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    try { if (caret != null) el.setSelectionRange(caret, caret); } catch (_) {}
  }

  /* ===== Aktionen ===== */
  async function run(fn, okMsg) {
    if (S.busy) return;
    S.busy = true; render();
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { toast(e.message || String(e), true); }
    finally { S.busy = false; render(); }
  }
  function logout(expired) {
    S.role = ''; S.pwd = '';
    store.del(LS.role); store.del(LS.pwd);
    if (expired) toast('Admin-PIN ungültig – bitte neu anmelden', true);
    go('home', '', true);
    render();
  }
  function exportCsv() {
    if (!S.data) return;
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [['Datum', 'Spieler', 'Vergehen', 'Betrag', 'Status'].join(';')].concat(
      S.data.rows.slice().sort((a, b) => a.t - b.t).map((r) => [ymd(r.t), q(r.name), q(r.fine), r.amount.toFixed(2).replace('.', ','), r.paid ? 'bezahlt' : 'offen'].join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'strafen-asv-natz-' + ymd(Date.now()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function saveAdd() {
    const A = S.add, fine = S.data.fines.find((f) => f.name === A.fine);
    if (!A.sel.size || !fine || S.busy) return;
    const base = A.day === 'gestern' ? new Date(Date.now() - DAY) : A.day === 'datum' && A.date ? new Date(A.date + 'T12:00:00') : new Date();
    const ts = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12).toISOString();
    const names = [...A.sel];
    const entries = names.map((name) => ({ name, fine: fine.name, amount: fine.amount, ts }));
    // Optimistisch anzeigen, Server-Antwort ersetzt danach den Stand
    const temp = entries.map((e, k) => ({ id: 'tmp-' + Date.now() + '-' + k, name: e.name, fine: e.fine, amount: e.amount, t: Date.parse(ts), paid: false }));
    const before = S.data.rows;
    S.data.rows = temp.concat(before).sort((a, b) => b.t - a.t);
    S.add = { sel: new Set(), fine: A.fine, day: 'heute', date: '', q: '' };
    go('home', '', true);
    run(async () => {
      try { await apiPost('add_entries', { entries }); }
      catch (e) { S.data.rows = before; throw e; }
    }, names.length + (names.length === 1 ? ' Strafe' : ' Strafen') + ' gespeichert · ' + eur(fine.amount * names.length));
  }

  const actions = {
    go: (el) => go(el.dataset.s, el.dataset.arg || ''),
    back: () => (history.length > 1 ? history.back() : go('home')),
    add: () => {
      if (!isAdmin()) { toast('Nur Admins können Strafen erfassen'); go('more'); return; }
      go('add');
    },
    asPlayer: () => { S.role = 'player'; store.set(LS.role, 'player'); go('home', '', true); render(); refresh(true); },
    logout: () => logout(false),
    refresh: () => refresh(),
    export: exportCsv,
    range: (el) => { S.range = el.dataset.v; render(); },
    pfilter: (el) => { S.pfilter = el.dataset.v; render(); },
    pick: (el) => { const n = el.dataset.arg; S.add.sel.has(n) ? S.add.sel.delete(n) : S.add.sel.add(n); render(); },
    fine: (el) => { S.add.fine = el.dataset.arg; render(); },
    day: (el) => { S.add.day = el.dataset.v; render(); },
    saveAdd,
    pin: (el) => { if (S.busy || S.pin.length >= 4) return; S.pin += el.dataset.v; render(); if (S.pin.length === 4) forms.login(); },
    pinDel: () => { S.pin = S.pin.slice(0, -1); render(); },
    togglePaid: (el) => {
      const r = S.data.rows.find((x) => x.id === el.dataset.id);
      if (!r || r.id.startsWith('tmp-')) return;
      const paid = !r.paid;
      r.paid = paid;
      run(async () => { try { await apiPost('set_paid', { ids: [r.id], paid }); } catch (e) { r.paid = !paid; throw e; } });
    },
    payAll: (el) => {
      const name = el.dataset.arg;
      const open = S.data.rows.filter((r) => r.name === name && !r.paid && !r.id.startsWith('tmp-'));
      if (!open.length || !confirm(name + ': ' + open.length + ' offene Strafen (' + eur(sum(open, (r) => r.amount)) + ') als bezahlt markieren?')) return;
      open.forEach((r) => { r.paid = true; });
      run(async () => { try { await apiPost('set_paid', { ids: open.map((r) => r.id), paid: true }); } catch (e) { open.forEach((r) => { r.paid = false; }); throw e; } }, 'Als bezahlt markiert');
    },
    delEntry: (el) => {
      const r = S.data.rows.find((x) => x.id === el.dataset.id);
      if (!r || r.id.startsWith('tmp-') || !confirm('Strafe „' + r.fine + '“ (' + eur(r.amount) + ') von ' + r.name + ' löschen?')) return;
      run(() => apiPost('delete_entry', { id: r.id }), 'Eintrag gelöscht');
    },
    editFine: (el) => { S.editFine = el.dataset.arg; render(); if (S.editFine) window.scrollTo(0, 0); },
    delFine: (el) => {
      const n = el.dataset.arg;
      if (!confirm('Strafe „' + n + '“ aus dem Katalog löschen? Bereits erfasste Einträge bleiben erhalten.')) return;
      run(() => apiPost('delete_fine', { name: n }), 'Strafe gelöscht');
    },
    delPlayer: (el) => {
      const n = el.dataset.arg;
      if (!confirm(n + ' aus dem Kader entfernen?')) return;
      S.add.sel.delete(n);
      run(() => apiPost('delete_player', { name: n }), n + ' entfernt');
    }
  };
  const forms = {
    login: () => {
      const pwd = S.pin;
      if (pwd.length !== 4) return;
      const prev = S.pwd;
      S.pwd = pwd;
      run(async () => {
        try { await apiPost('check_admin'); }
        catch (e) { S.pwd = prev; S.pin = ''; S.pinErr = true; setTimeout(() => { S.pinErr = false; render(); }, 600); throw e; }
        S.pin = '';
        S.role = 'admin';
        store.set(LS.role, 'admin'); store.set(LS.pwd, pwd);
        go('home', '', true);
        if (!S.data) refresh(true);
      }, 'Als Admin angemeldet');
    },
    fine: () => {
      const name = document.getElementById('fname').value.trim();
      const amount = num(document.getElementById('famount').value);
      if (!name || !(amount >= 0)) { toast('Bitte Vergehen und Betrag angeben', true); return; }
      run(async () => { await apiPost('upsert_fine', { name, amount }); S.editFine = ''; }, '„' + name + '“ gespeichert');
    },
    player: () => {
      const name = document.getElementById('pname').value.trim();
      if (!name) return;
      run(() => apiPost('upsert_player', { name }), name + ' hinzugefügt');
    }
  };

  $app.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn) { ev.preventDefault(); fn(el); }
  });
  $app.addEventListener('submit', (ev) => {
    const f = ev.target.closest('[data-form]');
    if (!f) return;
    ev.preventDefault();
    const fn = forms[f.dataset.form];
    if (fn) fn();
  });
  $app.addEventListener('input', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.in;
    if (!k) return;
    if (k === 'pq') S.pq = ev.target.value;
    else if (k === 'aq') S.add.q = ev.target.value;
    else if (k === 'adate') { S.add.date = ev.target.value; return; }
    render();
  });
  document.addEventListener('keydown', (ev) => {
    if (!document.querySelector('.pinpad') || (ev.target && ev.target.tagName === 'INPUT')) return;
    if (/^[0-9]$/.test(ev.key)) actions.pin({ dataset: { v: ev.key } });
    else if (ev.key === 'Backspace') actions.pinDel();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.role && Date.now() - S.lastSync > 60000) refresh(true);
  });

  /* ===== Start ===== */
  try { const c = store.get(LS.cache); if (c) S.data = normalize(JSON.parse(c)); } catch (_) {}
  S.route = parseHash();
  render();
  if (S.role) refresh(!!S.data);
})();
