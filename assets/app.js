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
    pin: '', pinErr: false,
    base: { screen: 'home', arg: '' }, sheetPushed: false
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
    trend: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>', 18),
    chev: svg('<path d="M9 6l6 6-6 6"/>', 18),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 18),
    x: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', 18),
    back: svg('<path d="M15 5l-7 7 7 7"/>', 24, 2.4),
    delKey: svg('<path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6"/><path d="M12 9l5 6"/>', 26, 1.8),
    list: svg('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>', 18),
    check2: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>', 18),
    share: svg('<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>', 18),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', 18),
    trash: svg('<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>', 20)
  };

  /* ===== Routing (Hash → Zurück-Taste funktioniert) ===== */
  // Seiten liegen in der Tab-Leiste, „push“-Seiten kommen von rechts, „sheet“-Seiten von unten
  const SCREENS = {
    home: { title: 'Strafenkasse', tab: 'home' },
    stats: { title: 'Auswertung', tab: 'stats' },
    players: { title: 'Spieler', tab: 'players' },
    more: { title: 'Mehr', tab: 'more' },
    catalog: { title: 'Strafenkatalog', tab: 'more', push: 'Mehr' },
    squad: { title: 'Kader', tab: 'more', push: 'Mehr' },
    player: { sheet: true },
    add: { sheet: true }
  };
  const isSheet = (s) => !!(SCREENS[s] && SCREENS[s].sheet);
  function parseHash() {
    const [screen, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    return { screen: SCREENS[screen] ? screen : 'home', arg: decodeURIComponent(rest.join('/') || '') };
  }
  function go(screen, arg, replace) {
    const h = '#/' + screen + (arg ? '/' + encodeURIComponent(arg) : '');
    if (location.hash === h) { render(); return; }
    if (isSheet(screen) && !isSheet(S.route.screen)) S.sheetPushed = true;
    if (replace) location.replace(h); else location.hash = h;
  }
  window.addEventListener('hashchange', () => {
    const r = parseHash();
    if (!isSheet(r.screen)) { S.base = r; S.sheetPushed = false; }
    S.route = r;
    render();
  });
  // Sheet animiert schließen, dann zur Seite darunter zurück
  function closeSheet() {
    const wrap = document.querySelector('.sheet-wrap');
    const done = () => { if (S.sheetPushed) history.back(); else go(S.base.screen, S.base.arg, true); };
    if (!wrap || reduceMotion()) { done(); return; }
    wrap.classList.add('leaving');
    setTimeout(done, 240);
  }
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const haptic = (ms = 8) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} };

  /* ===== Bausteine ===== */
  const isAdmin = () => S.role === 'admin';
  const skeleton = () => '<div class="skel"></div><div class="skel" style="min-height:160px"></div><div class="skel"></div>';
  const empty = (t) => '<div class="empty">' + esc(t) + '</div>';
  const section = (title, body, right) => '<section class="group">' + (title ? '<div class="group-head"><h2>' + esc(title) + '</h2>' + (right || '') + '</div>' : '') + body + '</section>';
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
      '<span class="amt">' + eur(r.amount) + '</span><span class="chev">' + I.chev + '</span></button>';
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
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--sep)"/>' +
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
        f += '<rect x="' + a.toFixed(1) + '" y="' + T + '" width="' + (b - a).toFixed(1) + '" height="' + (H - T - B) + '" fill="var(--fill)" fill-opacity="1"/>' +
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
      '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="4.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/></svg>';
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
      '<div class="login-head"><img class="logo" src="assets/logo-192.png" width="88" height="88" alt="ASV Natz Logo"><h1>Strafenkasse</h1><p>ASV Natz</p></div>' +
      '<button type="button" class="btn primary" data-a="asPlayer">Als Spieler ansehen</button>' +
      '<div class="divider">oder als Admin</div>' + loginForm() + '</div>';
  }
  function loginForm() {
    const dots = [0, 1, 2, 3].map((i) => '<i' + (i < S.pin.length ? ' class="on"' : '') + '></i>').join('');
    const key = (d) => '<button type="button" data-a="pin" data-v="' + d + '"' + (S.busy ? ' disabled' : '') + '>' + d + '</button>';
    return '<div class="pinpad' + (S.pinErr ? ' err' : '') + '"><span class="pin-label">' + (S.busy ? 'Prüfe …' : 'Admin-PIN eingeben') + '</span>' +
      '<div class="dots" role="status" aria-label="' + S.pin.length + ' von 4 Ziffern">' + dots + '</div>' +
      '<div class="keys">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('') + '<span></span>' + key(0) +
      '<button type="button" class="del" data-a="pinDel" aria-label="Löschen"' + (S.busy ? ' disabled' : '') + '>' + I.delKey + '</button></div></div>';
  }

  function viewHome() {
    if (!S.data) return skeleton();
    const rows = S.data.rows;
    const total = sum(rows, (r) => r.amount), open = sum(rows.filter((r) => !r.paid), (r) => r.amount), paid = total - open;
    const week = sum(rows.filter((r) => r.t > Date.now() - 7 * DAY), (r) => r.amount);
    const fc = forecast(rows);
    const top = playerStats().filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
    const pct = total ? paid / total * 100 : 0;
    return '<section class="card hero" aria-label="Kassenstand">' +
        '<div class="hero-head"><span>Strafen gesamt</span>' + (week ? '<span class="delta">+' + eur(week) + ' in 7 Tagen</span>' : '<span>' + rows.length + ' Einträge</span>') + '</div>' +
        '<span class="big">' + eur(total) + '</span>' + sparkline(rows) +
        '<div class="progress" role="img" aria-label="' + Math.round(pct) + ' Prozent bezahlt"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '<div class="grid2"><div class="stat"><span>Bezahlt</span><b>' + eur(paid) + '</b></div><div class="stat"><span>Noch offen</span><b class="warn">' + eur(open) + '</b></div></div>' +
      '</section>' +
      '<div class="list"><button type="button" class="item" data-a="go" data-s="stats"><span class="icon-tile">' + I.trend + '</span>' +
        '<span class="main"><b>' + (fc ? 'Prognose: ca. ' + eur0(fc.value) : 'Auswertung') + '</b><span class="sub">' + (fc ? esc(fc.season.label) + ' · ' + eur0(fc.lo) + '–' + eur0(fc.hi) : 'Verlauf und Statistiken') + '</span></span>' +
        '<span class="chev">' + I.chev + '</span></button></div>' +
      section('Top-Sünder', '<div class="list">' + (top.length ? top.map((p, k) =>
          '<button type="button" class="item" data-a="go" data-s="player" data-arg="' + esc(p.name) + '"><span class="rank">' + (k + 1) + '</span><span class="avatar">' + esc(initials(p.name)) + '</span>' +
          '<span class="main"><b>' + esc(p.name) + '</b><span class="sub">' + p.n + (p.n === 1 ? ' Strafe' : ' Strafen') + '</span></span><span class="amt">' + eur(p.total) + '</span><span class="chev">' + I.chev + '</span></button>').join('') : empty('Noch keine Strafen')) + '</div>') +
      section('Letzte Einträge', '<div class="list">' + (rows.length ? rows.slice(0, 5).map((r) => entryItem(r, true)).join('') : empty('Noch keine Einträge')) + '</div>',
        '<button type="button" class="link" data-a="go" data-s="players">Alle</button>') +
      syncLine();
  }

  function viewStats() {
    const head = '<div class="seg" role="group" aria-label="Zeitraum">' + [['4w', '4 Wochen'], ['saison', 'Saison'], ['gesamt', 'Gesamt']].map(([k, l]) =>
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
      '<section class="card"><div class="card-head"><b>' + title + '</b><span>' + esc(sub) + '</span></div>' +
        (rows.length || fc ? chart(all, from, to, fc) : empty('Keine Einträge in diesem Zeitraum')) +
        '<div class="legend"><span><i></i>Ist</span>' + (fc ? '<span><i class="dash"></i>Prognose</span><span><i class="band"></i>Spanne</span>' : '') + '</div>' + note + '</section>' +
      '<div class="grid2">' +
        '<div class="kpi"><span>Summe</span><b>' + eur(total) + '</b></div>' +
        '<div class="kpi"><span>Ø pro Woche</span><b>' + eur(total / weeks) + '</b></div>' +
        '<div class="kpi"><span>Ø pro Spieler</span><b>' + eur(people ? total / people : 0) + '</b></div>' +
        '<div class="kpi"><span>Häufigster Tag</span><b>' + topWd + '</b></div>' +
      '</div>' +
      section('Häufigste Vergehen', '<div class="card">' + bars(fineBars) + '</div>') +
      section('Spieler-Ranking', '<div class="card">' + bars(pBars) + '</div>');
  }

  function viewPlayers() {
    const head = '<label class="search">' + I.search + '<input id="pq" type="search" data-in="pq" value="' + esc(S.pq) + '" placeholder="Suchen" aria-label="Spieler suchen" autocomplete="off"></label>' +
      '<div class="seg" role="group" aria-label="Filter">' + [['alle', 'Alle'], ['offen', 'Nur offene']].map(([k, l]) =>
        '<button type="button" data-a="pfilter" data-v="' + k + '" aria-pressed="' + (S.pfilter === k) + '">' + l + '</button>').join('') + '</div>';
    if (!S.data) return head + skeleton();
    const q = S.pq.trim().toLowerCase();
    const list = playerStats()
      .filter((p) => (!q || p.name.toLowerCase().includes(q)) && (S.pfilter === 'alle' || p.open > 0))
      .sort((a, b) => S.pfilter === 'offen' ? b.open - a.open : b.total - a.total || a.name.localeCompare(b.name, 'de'));
    const openSum = sum(list, (p) => p.open);
    return head +
      section(S.pfilter === 'offen' && list.length ? list.length + ' Spieler · ' + eur(openSum) + ' offen' : '',
        '<div class="list">' + (list.length ? list.map((p) =>
        '<button type="button" class="item" data-a="go" data-s="player" data-arg="' + esc(p.name) + '"><span class="avatar">' + esc(initials(p.name)) + '</span>' +
        '<span class="main"><b>' + esc(p.name) + '</b><span class="sub">' + p.n + (p.n === 1 ? ' Strafe' : ' Strafen') + ' · ' + eur(p.total) + '</span></span>' +
        (p.open > 0 ? '<span class="pill open">' + eur(p.open) + '</span>' : p.n ? '<span class="pill paid">bezahlt</span>' : '') + '<span class="chev">' + I.chev + '</span></button>').join('')
        : empty(q ? 'Kein Spieler gefunden' : 'Alle haben bezahlt')) + '</div>');
  }

  function viewPlayer(name) {
    if (!S.data) return skeleton();
    const rows = S.data.rows.filter((r) => r.name === name);
    const total = sum(rows, (r) => r.amount), open = sum(rows.filter((r) => !r.paid), (r) => r.amount);
    const admin = isAdmin();
    return '<div class="profile"><span class="avatar lg">' + esc(initials(name)) + '</span><h2>' + esc(name) + '</h2>' +
        '<div class="grid2"><div class="stat"><span>Gesamt</span><b>' + eur(total) + '</b></div><div class="stat"><span>Noch offen</span><b class="warn">' + eur(open) + '</b></div></div>' +
        (admin && open > 0 ? '<button type="button" class="btn primary" data-a="payAll" data-arg="' + esc(name) + '">Alles bezahlt · ' + eur(open) + '</button>' : '') + '</div>' +
      section(rows.length + (rows.length === 1 ? ' Strafe' : ' Strafen'), '<div class="list">' + (rows.length ? rows.map((r) => {
        const status = '<span class="pill ' + (r.paid ? 'paid' : 'open') + '">' + (r.paid ? 'bezahlt' : 'offen') + '</span>';
        const row = '<span class="main"><b>' + esc(r.fine) + '</b><span class="sub">' + fmtDay(r.t) + ' · ' + eur(r.amount) + '</span></span>' + status;
        if (!admin) return '<div class="item">' + row + '</div>';
        return '<div class="swipe">' +
          '<div class="swipe-actions"><button type="button" class="sa ' + (r.paid ? 'unpay' : 'pay') + '" data-a="togglePaid" data-id="' + esc(r.id) + '">' + (r.paid ? 'Offen' : 'Bezahlt') + '</button>' +
          '<button type="button" class="sa del" data-a="delEntry" data-id="' + esc(r.id) + '">Löschen</button></div>' +
          '<div class="item swipe-row">' + row + '</div></div>';
      }).join('') : empty('Keine Strafen – vorbildlich!')) + '</div>') +
      (admin && rows.length ? '<p class="sync">Eintrag nach links wischen: bezahlt markieren oder löschen.</p>' : '');
  }

  function viewAdd() {
    if (!isAdmin()) return '<div class="card">' + loginForm() + '</div>';
    const A = S.add;
    if (!S.data) return skeleton();
    const names = playerNames();
    const q = A.q.trim().toLowerCase();
    const shown = names.filter((n) => !q || n.toLowerCase().includes(q) || A.sel.has(n));
    const fines = S.data.fines.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return section('Wer? · ' + A.sel.size + ' ausgewählt',
        (names.length > 12 ? '<label class="search">' + I.search + '<input id="aq" type="search" data-in="aq" value="' + esc(A.q) + '" placeholder="Name filtern" aria-label="Name filtern" autocomplete="off"></label>' : '') +
        (names.length ? '<div class="chips">' + shown.map((n) => '<button type="button" data-a="pick" data-arg="' + esc(n) + '" aria-pressed="' + A.sel.has(n) + '">' + esc(n) + '</button>').join('') + '</div>'
          : empty('Noch keine Spieler – unter „Mehr → Kader“ anlegen'))) +
      section('Was?', fines.length ? '<div class="tiles">' + fines.map((f) => '<button type="button" data-a="fine" data-arg="' + esc(f.name) + '" aria-pressed="' + (A.fine === f.name) + '"><span>' + esc(f.name) + '</span><b>' + eur(f.amount) + '</b></button>').join('') + '</div>'
          : empty('Noch keine Strafen – unter „Mehr → Strafenkatalog“ anlegen')) +
      section('Wann?', '<div class="seg" role="group" aria-label="Datum">' + [['heute', 'Heute'], ['gestern', 'Gestern'], ['datum', 'Datum …']].map(([k, l]) =>
          '<button type="button" data-a="day" data-v="' + k + '" aria-pressed="' + (A.day === k) + '">' + l + '</button>').join('') + '</div>' +
        (A.day === 'datum' ? '<label class="field"><input id="adate" type="date" data-in="adate" value="' + esc(A.date || ymd(Date.now())) + '" max="' + ymd(Date.now()) + '" aria-label="Datum"></label>' : ''));
  }
  function addFoot() {
    const A = S.add, fine = S.data && S.data.fines.find((f) => f.name === A.fine);
    const total = A.sel.size * (fine ? fine.amount : 0);
    const ok = A.sel.size > 0 && !!fine && !S.busy;
    const label = !A.sel.size ? 'Spieler auswählen' : !fine ? 'Strafe auswählen' : 'Speichern · ' + eur(total);
    return '<div class="sheet-foot"><div class="sum"><span>' + A.sel.size + ' × ' + esc(fine ? fine.name : '–') + '</span><b>' + eur(total) + '</b></div>' +
      '<button type="button" class="btn primary" data-a="saveAdd"' + (ok ? '' : ' disabled') + '>' + label + '</button></div>';
  }

  function viewMore() {
    const d = S.data;
    let h = '';
    if (isAdmin()) {
      h += section('Verwaltung', '<div class="list">' +
        moreItem('go', 'catalog', 'Strafenkatalog', d ? d.fines.length + ' Vergehen und Beträge' : 'Vergehen und Beträge', I.list) +
        moreItem('go', 'squad', 'Kader', d ? playerNames().length + ' Spieler' : 'Spieler verwalten', I.users) +
        moreItem('go', 'players', 'Zahlungen', 'Offene Beträge abhaken', I.check2) + '</div>');
    } else {
      h += section('Admin-Zugang', '<div class="card">' + loginForm() + '</div>');
      if (S.oldScript) h += '<p class="note" style="color:var(--warn)">Hinweis: ' + esc(OLD_SCRIPT) + '. Erst dann funktioniert die Admin-Anmeldung.</p>';
    }
    h += section('Daten', '<div class="list">' +
      moreItem('export', '', 'Export als CSV', 'Für Excel, mit allen Einträgen', I.share) +
      moreItem('refresh', '', 'Jetzt aktualisieren', S.lastSync ? 'Zuletzt ' + new Date(S.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'Daten neu laden', I.refresh) + '</div>') +
      section('Konto', '<div class="list"><button type="button" class="item center" data-a="logout"><b style="color:var(--danger)">' + (isAdmin() ? 'Abmelden' : 'Rolle wechseln') + '</b></button></div>') +
      '<p class="sync">Tipp: Im Teilen-Menü „Zum Home-Bildschirm“ wählen – dann startet die Strafenkasse wie eine App.</p>';
    return h;
  }
  const moreItem = (a, s, title, sub, icon) => '<button type="button" class="item" data-a="' + a + '"' + (s ? ' data-s="' + s + '"' : '') + '>' + (icon ? '<span class="icon-tile">' + icon + '</span>' : '') +
    '<span class="main"><b>' + esc(title) + '</b><span class="sub">' + esc(sub) + '</span></span><span class="chev">' + I.chev + '</span></button>';

  function viewCatalog() {
    if (!isAdmin()) return viewMore();
    const fines = S.data ? S.data.fines.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')) : [];
    const cur = fines.find((f) => f.name === S.editFine);
    return section(cur ? 'Strafe bearbeiten' : 'Neue Strafe',
        '<form class="list form" data-form="fine">' +
        '<label class="item"><span class="flabel">Vergehen</span><input id="fname" placeholder="z. B. Zu spät" required value="' + esc(cur ? cur.name : '') + '"' + (cur ? ' readonly' : '') + '></label>' +
        '<label class="item"><span class="flabel">Betrag</span><input id="famount" inputmode="decimal" placeholder="0,00" required value="' + (cur ? String(cur.amount).replace('.', ',') : '') + '"><span class="muted">€</span></label>' +
        '<div class="form-actions">' + (cur ? '<button type="button" class="btn ghost" data-a="editFine" data-arg="">Abbrechen</button>' : '') +
        '<button type="submit" class="btn primary"' + (S.busy ? ' disabled' : '') + '>Speichern</button></div></form>') +
      section('Katalog', '<div class="list">' + (fines.length ? fines.map((f) =>
        '<div class="item"><button type="button" class="main plain" data-a="editFine" data-arg="' + esc(f.name) + '"><b>' + esc(f.name) + '</b><span class="sub">' + eur(f.amount) + '</span></button>' +
        '<button type="button" class="icon-btn" data-a="delFine" data-arg="' + esc(f.name) + '" aria-label="' + esc(f.name) + ' löschen">' + I.trash + '</button></div>').join('') : empty('Noch keine Strafen')) + '</div>') +
      '<p class="sync">Zum Bearbeiten auf eine Strafe tippen.</p>';
  }

  function viewSquad() {
    if (!isAdmin()) return viewMore();
    const names = S.data ? S.data.players.slice().sort((a, b) => a.localeCompare(b, 'de')) : [];
    return section('Neuer Spieler', '<form class="list form" data-form="player"><label class="item"><input id="pname" placeholder="Vor- und Nachname" aria-label="Name des Spielers" required autocomplete="off">' +
        '<button type="submit" class="link"' + (S.busy ? ' disabled' : '') + '>Hinzufügen</button></label></form>') +
      section(names.length + ' Spieler', '<div class="list">' + (names.length ? names.map((n) =>
        '<div class="item"><span class="avatar">' + esc(initials(n)) + '</span><span class="main"><b>' + esc(n) + '</b></span>' +
        '<button type="button" class="icon-btn" data-a="delPlayer" data-arg="' + esc(n) + '" aria-label="' + esc(n) + ' entfernen">' + I.trash + '</button></div>').join('') : empty('Noch keine Spieler')) + '</div>') +
      '<p class="sync">Bereits erfasste Strafen bleiben erhalten, wenn ein Spieler entfernt wird.</p>';
  }

  function tabbar(tab) {
    const b = (s, label, icon) => '<button type="button" data-a="go" data-s="' + s + '"' + (tab === s ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></button>';
    return '<nav class="tabbar" aria-label="Hauptnavigation"><div>' +
      b('home', 'Übersicht', I.home) + b('stats', 'Auswertung', I.stats) +
      '<button type="button" class="tab-add" data-a="add" aria-label="Strafe erfassen"><span>' + I.plus + '</span></button>' +
      b('players', 'Spieler', I.users) + b('more', 'Mehr', I.more) + '</div></nav>';
  }
  function navbar(cfg, title) {
    return '<header class="navbar' + (cfg.push ? ' always' : '') + '"><div class="nb-in">' +
      (cfg.push ? '<button type="button" class="nb-back" data-a="back">' + I.back + '<span>' + esc(cfg.push) + '</span></button>' : '<span></span>') +
      '<span class="nb-title">' + esc(title) + '</span><span></span></div></header>';
  }

  /* ===== Render ===== */
  function pageHtml(route) {
    const cfg = SCREENS[route.screen];
    let body;
    switch (route.screen) {
      case 'stats': body = viewStats(); break;
      case 'players': body = viewPlayers(); break;
      case 'more': body = viewMore(); break;
      case 'catalog': body = viewCatalog(); break;
      case 'squad': body = viewSquad(); break;
      default: body = viewHome();
    }
    const large = cfg.push ? '' : '<div class="large-title"><h1>' + esc(cfg.title) + '</h1>' +
      (route.screen === 'home' ? '<button type="button" class="nb-logo" data-a="go" data-s="more" aria-label="' + (isAdmin() ? 'Admin' : 'Spieler') + ' – Mehr"><img src="assets/logo-96.webp" width="36" height="36" alt=""></button>' : '') + '</div>';
    return navbar(cfg, cfg.title) + '<main class="view' + (cfg.push ? ' pushed' : '') + '" data-key="' + route.screen + '">' + large + body + '</main>' + tabbar(cfg.tab);
  }
  function sheetHtml(route) {
    const add = route.screen === 'add';
    const title = add ? 'Strafe erfassen' : route.arg;
    return '<div class="sheet-wrap"><div class="backdrop" data-a="closeSheet"></div>' +
      '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="grabber" aria-hidden="true"></div>' +
      '<div class="sheet-nav"><button type="button" data-a="closeSheet">' + (add ? 'Abbrechen' : 'Fertig') + '</button><b>' + esc(add ? title : '') + '</b><span></span></div>' +
      '<div class="sheet-body">' + (add ? viewAdd() : viewPlayer(route.arg)) + '</div>' +
      (add && isAdmin() && S.data ? addFoot() : '') + '</section></div>';
  }
  let last = { page: '', sheet: '' };
  function render() {
    const active = document.activeElement;
    const focusId = active && active.id, caret = active && active.selectionStart;
    const sb = document.querySelector('.sheet-body'), sheetScroll = sb ? sb.scrollTop : 0;
    if (!S.role) {
      $app.innerHTML = viewLogin();
      document.documentElement.classList.remove('lock');
      last = { page: 'login', sheet: '' };
      restore(focusId, caret);
      return;
    }
    const sheet = isSheet(S.route.screen) ? S.route : null;
    const base = sheet ? S.base : S.route;
    const pageKey = base.screen, sheetKey = sheet ? sheet.screen + '/' + sheet.arg : '';
    $app.innerHTML = pageHtml(base) + (sheet ? sheetHtml(sheet) : '');
    document.documentElement.classList.toggle('lock', !!sheet);
    // Übergänge nur, wenn sich die Seite wirklich ändert (nicht bei jedem Tippen)
    if (pageKey !== last.page) {
      const v = $app.querySelector('.view');
      if (v && last.page && !reduceMotion()) v.classList.add(SCREENS[pageKey].push ? 'enter-push' : 'enter-fade');
      if (!sheet) window.scrollTo(0, 0);
    }
    if (sheet) {
      const wrap = $app.querySelector('.sheet-wrap');
      if (sheetKey !== last.sheet) { if (!reduceMotion()) wrap.classList.add('enter'); }
      else { const nb = $app.querySelector('.sheet-body'); if (nb) nb.scrollTop = sheetScroll; }
    }
    last = { page: pageKey, sheet: sheetKey };
    onScroll();
    restore(focusId, caret);
  }
  function restore(id, caret) {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    try { if (caret != null) el.setSelectionRange(caret, caret); } catch (_) {}
  }
  // Großer Titel wandert beim Scrollen in die Kopfleiste
  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      document.documentElement.classList.toggle('scrolled', window.scrollY > 36);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ===== Gesten ===== */
  (function gestures() {
    let g = null;
    const pt = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    document.addEventListener('touchstart', (e) => {
      const p = pt(e); if (!p) return;
      const t = e.target;
      const sheet = t.closest && t.closest('.sheet');
      const row = t.closest && t.closest('.swipe-row');
      if (row) g = { kind: 'row', el: row, x: p.clientX, y: p.clientY, base: row.classList.contains('open') ? -SW : 0, axis: '' };
      else if (sheet) {
        const body = sheet.querySelector('.sheet-body');
        const inBody = t.closest('.sheet-body');
        if (!inBody || body.scrollTop <= 0) g = { kind: 'sheet', el: sheet, x: p.clientX, y: p.clientY, t: Date.now(), axis: '' };
      } else if (standalone() && p.clientX < 22 && SCREENS[S.route.screen].push) g = { kind: 'edge', x: p.clientX, y: p.clientY, axis: '' };
      else if (standalone() && window.scrollY <= 0 && S.role) g = { kind: 'ptr', x: p.clientX, y: p.clientY, axis: '' };
      // offene Wisch-Zeilen schließen, wenn woanders getippt wird
      document.querySelectorAll('.swipe-row.open').forEach((r) => { if (r !== row) { r.classList.remove('open'); r.style.transform = ''; } });
    }, { passive: true });
    const SW = 176;
    document.addEventListener('touchmove', (e) => {
      if (!g) return;
      const p = pt(e), dx = p.clientX - g.x, dy = p.clientY - g.y;
      if (!g.axis) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; }
      if (g.kind === 'row' && g.axis === 'x') {
        e.preventDefault();
        g.dx = Math.max(-SW - 30, Math.min(0, g.base + dx));
        g.el.style.transition = 'none'; g.el.style.transform = 'translateX(' + g.dx + 'px)';
      } else if (g.kind === 'sheet' && g.axis === 'y' && dy > 0) {
        e.preventDefault();
        g.dy = dy;
        g.el.style.transition = 'none'; g.el.style.transform = 'translateY(' + dy + 'px)';
      } else if (g.kind === 'edge' && g.axis === 'x' && dx > 0) {
        g.dx = dx;
        const v = $app.querySelector('.view'); if (v) { v.style.transition = 'none'; v.style.transform = 'translateX(' + dx + 'px)'; }
      } else if (g.kind === 'ptr' && g.axis === 'y' && dy > 0 && window.scrollY <= 0) {
        g.dy = Math.min(dy * 0.5, 90);
        const v = $app.querySelector('.view'); if (v) { v.style.transition = 'none'; v.style.transform = 'translateY(' + g.dy + 'px)'; }
        ptr(g.dy);
      } else if (g.axis && g.kind !== 'row') g = null;
    }, { passive: false });
    document.addEventListener('touchend', () => {
      if (!g) return;
      const k = g; g = null;
      if (k.kind === 'row' && k.dx != null) {
        k.el.style.transition = ''; const open = k.dx < -SW / 2;
        k.el.classList.toggle('open', open); k.el.style.transform = open ? 'translateX(' + -SW + 'px)' : '';
        if (open) haptic(6);
      } else if (k.kind === 'sheet' && k.dy != null) {
        const fast = k.dy / Math.max(1, Date.now() - k.t) > 0.6;
        k.el.style.transition = '';
        if (k.dy > 120 || (fast && k.dy > 40)) { k.el.style.transform = 'translateY(100%)'; const w = k.el.parentNode; if (w) w.classList.add('leaving'); setTimeout(() => { S.sheetPushed ? history.back() : go(S.base.screen, S.base.arg, true); }, 220); }
        else k.el.style.transform = '';
      } else if (k.kind === 'edge' && k.dx != null) {
        const v = $app.querySelector('.view'); if (v) { v.style.transition = ''; v.style.transform = ''; }
        if (k.dx > 90) history.back();
      } else if (k.kind === 'ptr' && k.dy != null) {
        const v = $app.querySelector('.view'); if (v) { v.style.transition = ''; v.style.transform = ''; }
        ptr(0);
        if (k.dy > 64) { haptic(10); refresh(); }
      }
    });
    let ptrEl = null;
    function ptr(d) {
      if (!ptrEl) { ptrEl = document.createElement('div'); ptrEl.className = 'ptr'; ptrEl.innerHTML = I.refresh; document.body.appendChild(ptrEl); }
      ptrEl.style.opacity = d ? Math.min(1, d / 64) : 0;
      ptrEl.style.transform = 'translateX(-50%) rotate(' + d * 4 + 'deg)';
    }
  })();

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
    haptic(15);
    closeSheet();
    run(async () => {
      try { await apiPost('add_entries', { entries }); }
      catch (e) { S.data.rows = before; throw e; }
    }, names.length + (names.length === 1 ? ' Strafe' : ' Strafen') + ' gespeichert · ' + eur(fine.amount * names.length));
  }

  const actions = {
    go: (el) => go(el.dataset.s, el.dataset.arg || ''),
    back: () => (history.length > 1 ? history.back() : go('more')),
    closeSheet,
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
    pick: (el) => { const n = el.dataset.arg; haptic(5); S.add.sel.has(n) ? S.add.sel.delete(n) : S.add.sel.add(n); render(); },
    fine: (el) => { S.add.fine = el.dataset.arg; render(); },
    day: (el) => { S.add.day = el.dataset.v; render(); },
    saveAdd,
    pin: (el) => { if (S.busy || S.pin.length >= 4) return; haptic(5); S.pin += el.dataset.v; render(); if (S.pin.length === 4) forms.login(); },
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
        catch (e) { S.pwd = prev; S.pin = ''; S.pinErr = true; haptic([30, 40, 30]); setTimeout(() => { S.pinErr = false; render(); }, 600); throw e; }
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
  S.base = isSheet(S.route.screen) ? { screen: S.route.screen === 'player' ? 'players' : 'home', arg: '' } : S.route;
  render();
  if (S.role) refresh(!!S.data);
})();
