// Code.gs — PenaltyTrack API v2 (Google Sheets: Daten + Players + Fines)
//
// Script Properties:
//   API_KEY         Lesezugriff (steht öffentlich in der App)
//   ADMIN_PASSWORD  Admin-PIN, 4 Ziffern (wird NUR hier geprüft; nach 5 Fehlversuchen 15 Min. Sperre)
//
// Nach jeder Änderung: Bereitstellen → Bereitstellungen verwalten → Bearbeiten → Neue Version.

const SHEET_DATA = 'Daten';
const SHEET_PLAY = 'Players';
const SHEET_FINE = 'Fines';
const DATA_COLS = ['id', 'name', 'fine', 'amount', 'ts', 'paid', 'paidAt'];
const CODE_VERSION = 5; // bei jeder Änderung am Lesen erhöhen → alter Cache wird ignoriert
const CACHE_KEY = 'pt_all_v' + CODE_VERSION;
const CACHE_TTL = 600; // Sekunden; Schreibvorgänge leeren den Cache sofort

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); }
  return sh;
}

// Spalten über die Kopfzeile finden (Groß/Klein egal, auch deutsche Namen).
// Gibt es für ein Feld mehrere passende Spalten, wird beim Lesen die erste gefüllte genommen
// und beim Schreiben in alle geschrieben. Fehlende Spalten (z. B. paid/paidAt) werden rechts angehängt.
const DATA_ALIASES = {
  id: ['id'],
  name: ['name', 'spieler', 'player'],
  fine: ['fine', 'vergehen', 'strafe', 'strafenart', 'penalty', 'grund', 'reason'],
  amount: ['amount', 'betrag', 'euro'],
  ts: ['ts', 'datum', 'date', 'zeit', 'timestamp'],
  paid: ['paid', 'bezahlt'],
  paidAt: ['paidat', 'bezahltam', 'bezahlt am']
};
function dataSheet_() {
  const sh = sheet_(SHEET_DATA, DATA_COLS);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  const low = header.map(function (h) { return h.toLowerCase(); });
  const cols = {};
  DATA_COLS.forEach(function (c) {
    cols[c] = [];
    DATA_ALIASES[c].forEach(function (a) { low.forEach(function (h, i) { if (h === a && cols[c].indexOf(i) < 0) cols[c].push(i); }); });
    if (!cols[c].length) { header.push(c); low.push(c.toLowerCase()); sh.getRange(1, header.length).setValue(c); cols[c].push(header.length - 1); }
  });
  const known = {};
  Object.keys(cols).forEach(function (c) { cols[c].forEach(function (i) { known[i] = true; }); });
  const idx = {};
  DATA_COLS.forEach(function (c) { idx[c] = cols[c][0]; });
  const get = function (r, c) {
    for (let k = 0; k < cols[c].length; k++) { const v = r[cols[c][k]]; if (v !== '' && v != null) return v; }
    return '';
  };
  const set = function (row, c, v) { cols[c].forEach(function (i) { row[i] = v; }); };
  const other = header.map(function (_, i) { return i; }).filter(function (i) { return !known[i]; });
  return { sh: sh, header: header, idx: idx, cols: cols, get: get, set: set, other: other };
}

function body_(e) {
  if (e._body) return e._body;
  try { e._body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (_) { e._body = {}; }
  return e._body;
}

function auth_(e, needAdmin) {
  const b = body_(e);
  const api = b.apiKey || e.parameter.apiKey || '';
  if (!prop_('API_KEY') || api !== prop_('API_KEY')) return 'unauthorized';
  if (needAdmin) {
    // Schutz gegen Durchprobieren der PIN: nach 5 Fehlversuchen 15 Minuten Sperre
    const cache = CacheService.getScriptCache();
    if (cache.get('pt_lock')) return 'locked';
    const pwd = String(b.adminKey || '').trim();
    const want = prop_('ADMIN_PASSWORD').trim();
    if (!want || pwd !== want) {
      const fails = Number(cache.get('pt_fail') || 0) + 1;
      cache.put('pt_fail', String(fails), 900);
      if (fails >= 5) { cache.put('pt_lock', '1', 900); cache.remove('pt_fail'); }
      Utilities.sleep(800);
      return 'forbidden';
    }
    cache.remove('pt_fail');
  }
  return '';
}

/* ---------- Lesen (mit Cache) ---------- */

// Spalten in Players/Fines über die Kopfzeile finden (Reihenfolge egal, auch deutsche Namen)
function table_(sheetName, header) {
  const sh = sheet_(sheetName, header);
  const vals = sh.getDataRange().getValues();
  const head = (vals.shift() || []).map(function (h) { return String(h).trim().toLowerCase(); });
  const find = function (names, dflt) {
    for (let i = 0; i < names.length; i++) { const k = head.indexOf(names[i]); if (k >= 0) return k; }
    return dflt;
  };
  const name = find(['name', 'vergehen', 'strafe', 'spieler', 'strafenart'], 0);
  const amount = find(['amount', 'betrag', 'euro', '€'], name === 0 ? 1 : 0);
  return { sh: sh, vals: vals, width: Math.max(head.length, name + 1, amount + 1), name: name, amount: amount };
}

function readAll_() {
  const d = dataSheet_();
  const vals = d.sh.getDataRange().getValues(); vals.shift();
  const G = d.get;
  const iso = function (v) { return v instanceof Date ? v.toISOString() : String(v || ''); };

  const P = table_(SHEET_PLAY, ['name']);
  const players = P.vals.filter(function (r) { return r[P.name] !== ''; }).map(function (r) { return { name: String(r[P.name]) }; });

  const F = table_(SHEET_FINE, ['name', 'amount']);
  const fines = F.vals.filter(function (r) { return r[F.name] !== ''; }).map(function (r) { return { name: String(r[F.name]), amount: Number(r[F.amount] || 0) }; });
  const fineNames = {}; fines.forEach(function (f) { fineNames[f.name.toLowerCase()] = f.name; });

  const rows = vals.filter(function (r) { return G(r, 'id') !== '' || G(r, 'name') !== ''; }).map(function (r) {
    let fine = String(G(r, 'fine')).trim();
    // Notlösung: Strafenart steht in einer unbekannten Spalte → Wert nehmen, der im Strafenkatalog vorkommt
    if (!fine) {
      for (let k = 0; k < d.other.length; k++) {
        const v = String(r[d.other[k]] || '').trim();
        if (v && fineNames[v.toLowerCase()]) { fine = fineNames[v.toLowerCase()]; break; }
      }
    }
    const paid = G(r, 'paid');
    return {
      id: String(G(r, 'id')), name: String(G(r, 'name')), fine: fine,
      amount: Number(String(G(r, 'amount') || 0).replace(',', '.')) || 0, ts: iso(G(r, 'ts')),
      paid: paid === true || String(paid).toUpperCase() === 'TRUE', paidAt: iso(G(r, 'paidAt'))
    };
  });

  return { ok: true, rows: rows, players: players, fines: fines, at: new Date().toISOString() };
}

// CacheService erlaubt max. 100 KB pro Eintrag → in Stücke teilen.
function cacheGet_() {
  const c = CacheService.getScriptCache();
  const n = Number(c.get(CACHE_KEY + '_n') || 0);
  if (!n) return null;
  const keys = []; for (let i = 0; i < n; i++) keys.push(CACHE_KEY + '_' + i);
  const parts = c.getAll(keys);
  let s = '';
  for (let i = 0; i < n; i++) { const p = parts[keys[i]]; if (p == null) return null; s += p; }
  return s;
}
function cachePut_(s) {
  const c = CacheService.getScriptCache();
  const size = 90000, obj = {};
  let n = 0;
  for (let i = 0; i < s.length; i += size) obj[CACHE_KEY + '_' + (n++)] = s.substr(i, size);
  obj[CACHE_KEY + '_n'] = String(n);
  try { c.putAll(obj, CACHE_TTL); } catch (_) {}
}
function cacheClear_() { CacheService.getScriptCache().remove(CACHE_KEY + '_n'); }

function payloadString_() {
  let s = cacheGet_();
  if (!s) { s = JSON.stringify(readAll_()); cachePut_(s); }
  return s;
}

function doGet(e) {
  const err = auth_(e, false); if (err) return json_({ ok: false, error: err });
  return ContentService.createTextOutput(payloadString_()).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Schreiben (nur Admin) ---------- */

function doPost(e) {
  const b = body_(e);
  const action = String(e.parameter.action || b.action || '').toLowerCase();
  const err = auth_(e, true); if (err) return json_({ ok: false, error: err });
  if (action === 'check_admin') return json_({ ok: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const res = handle_(action, b);
    if (!res.ok) return json_(res);
    cacheClear_();
    const data = readAll_();
    cachePut_(JSON.stringify(data));
    res.data = data;
    return json_(res);
  } catch (ex) {
    return json_({ ok: false, error: String(ex) });
  } finally {
    lock.releaseLock();
  }
}

function handle_(action, b) {
  if (action === 'add_entries' || action === '') {
    const list = Array.isArray(b.entries) ? b.entries : [b];
    const d = dataSheet_();
    const out = [];
    list.forEach(function (x) {
      const name = String(x.name || ''), fine = String(x.fine || '');
      if (!name || !fine) return;
      const row = new Array(d.header.length).fill('');
      d.set(row, 'id', x.id || Utilities.getUuid());
      d.set(row, 'name', name);
      d.set(row, 'fine', fine);
      d.set(row, 'amount', Number(x.amount || 0));
      d.set(row, 'ts', String(x.ts || new Date().toISOString()));
      d.set(row, 'paid', false);
      out.push(row);
    });
    if (!out.length) return { ok: false, error: 'missing name/fine' };
    d.sh.getRange(d.sh.getLastRow() + 1, 1, out.length, d.header.length).setValues(out);
    return { ok: true, added: out.length };
  }

  if (action === 'delete_entry') {
    const id = String(b.id || ''); if (!id) return { ok: false, error: 'missing id' };
    const d = dataSheet_();
    const ids = d.sh.getRange(2, d.idx.id + 1, Math.max(d.sh.getLastRow() - 1, 1), 1).getValues();
    for (let r = 0; r < ids.length; r++) if (String(ids[r][0]) === id) { d.sh.deleteRow(r + 2); return { ok: true }; }
    return { ok: false, error: 'not found' };
  }

  if (action === 'set_paid') {
    const want = {}; (b.ids || []).forEach(function (id) { want[String(id)] = true; });
    const paid = b.paid !== false;
    const d = dataSheet_();
    const n = d.sh.getLastRow() - 1; if (n < 1) return { ok: true, changed: 0 };
    const ids = d.sh.getRange(2, d.idx.id + 1, n, 1).getValues();
    const paidRng = d.sh.getRange(2, d.idx.paid + 1, n, 1), atRng = d.sh.getRange(2, d.idx.paidAt + 1, n, 1);
    const pv = paidRng.getValues(), av = atRng.getValues();
    const now = new Date().toISOString();
    let changed = 0;
    for (let r = 0; r < n; r++) {
      if (want[String(ids[r][0])]) { pv[r][0] = paid; av[r][0] = paid ? now : ''; changed++; }
    }
    paidRng.setValues(pv); atRng.setValues(av);
    return { ok: true, changed: changed };
  }

  if (action === 'upsert_player') {
    const name = String(b.name || '').trim(); if (!name) return { ok: false, error: 'missing name' };
    const T = table_(SHEET_PLAY, ['name']);
    if (!T.vals.some(function (r) { return String(r[T.name]) === name; })) {
      const row = new Array(T.width).fill(''); row[T.name] = name; T.sh.appendRow(row);
    }
    return { ok: true };
  }
  if (action === 'delete_player') return deleteByName_(SHEET_PLAY, ['name'], b.name);

  if (action === 'upsert_fine') {
    const name = String(b.name || '').trim(); const amount = Number(b.amount);
    if (!name || !isFinite(amount)) return { ok: false, error: 'missing name/amount' };
    const T = table_(SHEET_FINE, ['name', 'amount']);
    for (let r = 0; r < T.vals.length; r++) {
      if (String(T.vals[r][T.name]) === name) { T.sh.getRange(r + 2, T.amount + 1).setValue(amount); return { ok: true }; }
    }
    const row = new Array(T.width).fill(''); row[T.name] = name; row[T.amount] = amount; T.sh.appendRow(row);
    return { ok: true };
  }
  if (action === 'delete_fine') return deleteByName_(SHEET_FINE, ['name', 'amount'], b.name);

  return { ok: false, error: 'unknown action' };
}

function deleteByName_(sheetName, header, name) {
  name = String(name || ''); if (!name) return { ok: false, error: 'missing name' };
  const T = table_(sheetName, header);
  for (let r = 0; r < T.vals.length; r++) if (String(T.vals[r][T.name]) === name) { T.sh.deleteRow(r + 2); return { ok: true }; }
  return { ok: false, error: 'not found' };
}
