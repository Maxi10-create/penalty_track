// app.js
const LS = { api:'pt_api', key:'pt_key', adm:'pt_adm', role:'pt_role' };
const PLAYER_PWD = "2024";
const ADMIN_PWD  = "admin2024";

let chart; // Chart.js instance

// ---------- Config ----------
const byId = id => document.getElementById(id);
function loadCfg(){
  byId('apiUrl').value = localStorage.getItem(LS.api) || '';
  byId('apiKey').value = localStorage.getItem(LS.key) || '';
  byId('adminKey').value = localStorage.getItem(LS.adm) || '';
  updateRoleTag();
}
function saveCfg(){
  localStorage.setItem(LS.api, byId('apiUrl').value.trim());
  localStorage.setItem(LS.key, byId('apiKey').value.trim());
  localStorage.setItem(LS.adm, byId('adminKey').value.trim());
  updateRoleTag();
}
function clearCfg(){
  localStorage.removeItem(LS.api);
  localStorage.removeItem(LS.key);
  localStorage.removeItem(LS.adm);
  updateRoleTag();
}
function updateRoleTag(){
  const role = localStorage.getItem(LS.role) || '–';
  byId('roleTag').textContent = `Rolle: ${role}`;
  const isAdmin = role === 'Admin';
  document.querySelectorAll('.adminOnly').forEach(el => el.style.display = isAdmin ? '' : 'none');
}

// ---------- Role Screen ----------
function showApp(){
  byId('screenRole').classList.add('hidden');
  byId('tabs').classList.remove('hidden');
  switchTab('tab1');
}
byId('btnPlayer').onclick = () => {
  // Spieler: "nur klicken" (internes PW, kein Prompt)
  localStorage.setItem(LS.role, 'Spieler'); updateRoleTag(); showApp();
};
byId('btnAdmin').onclick = () => {
  const pwd = byId('adminPwd').value.trim();
  if (pwd !== ADMIN_PWD) { alert('Falsches Admin-Passwort'); return; }
  localStorage.setItem(LS.role, 'Admin'); updateRoleTag(); showApp();
};

// ---------- Tabs ----------
document.querySelectorAll('#tabs button').forEach(b=>{
  b.onclick = ()=> switchTab(b.dataset.tab);
});
function switchTab(id){
  document.querySelectorAll('.tab').forEach(s=> s.classList.add('hidden'));
  document.querySelectorAll('#tabs button').forEach(b=> b.classList.remove('active'));
  byId(id).classList.remove('hidden');
  document.querySelector(`#tabs button[data-tab="${id}"]`).classList.add('active');
  if (id==='tab1') refreshDashboard();
  if (id==='tab2') refreshDetail();
  if (id==='tab3') loadStammdatenIntoEntry();
  if (id==='tab4') refreshStammdaten();
}

// ---------- API ----------
function getCfg(){
  const api = (localStorage.getItem(LS.api)||'').trim();
  const key = (localStorage.getItem(LS.key)||'').trim();
  if (!api || !key) throw new Error('Konfiguration unvollständig');
  return {api,key,adm:(localStorage.getItem(LS.adm)||'').trim()};
}
async function apiGet(params={}){
  const {api,key} = getCfg();
  const u = new URL(api);
  u.searchParams.set('apiKey', key);
  Object.entries(params).forEach(([k,v])=> u.searchParams.set(k, v));
  const r = await fetch(u.toString());
  if(!r.ok) throw new Error('GET '+r.status);
  return r.json();
}
async function apiPost(payload){
  const {api,key} = getCfg();
  const body = { ...payload, apiKey:key };
  const r = await fetch(api, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!r.ok) throw new Error('POST '+r.status);
  return r.json();
}
async function apiAdmin(action, payload){
  const {api,key,adm} = getCfg();
  const body = { action, apiKey:key, adminKey:adm, ...payload };
  const r = await fetch(api + `?action=${encodeURIComponent(action)}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if(!r.ok) throw new Error(action+' '+r.status);
  return r.json();
}

// ---------- Data helpers ----------
function parseAmount(e){ // entry row -> amount number
  const x = Number(e.amount ?? e.betrag ?? e.value ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function fmtDate(iso){ try{return new Date(iso).toLocaleString();}catch{return iso;} }

// ---------- Dashboard (Tab1) ----------
async function refreshDashboard(){
  try{
    const data = await apiGet({ view:'all' }); // returns {ok, rows, players, fines}
    if(!data.ok) throw new Error(data.error||'API-Fehler');
    const rows = (data.rows||[]).map(r=> ({...r, amount: Number(r.amount||r.betrag||r.value||0)}));

    // Pott
    const sum = rows.reduce((a,r)=> a + (Number(r.amount)||0), 0);
    byId('pott').textContent = `${sum.toFixed(2)} €`;

    // Top 3 Spieler
    const perPlayer = {};
    rows.forEach(r=>{
      const k = r.name || r.player || '';
      perPlayer[k] = (perPlayer[k]||0) + (Number(r.amount)||0);
    });
    const top = Object.entries(perPlayer).sort((a,b)=> b[1]-a[1]).slice(0,3);
    const ol = byId('top3'); ol.innerHTML='';
    top.forEach(([n,amt])=>{
      const li = document.createElement('li'); li.textContent = `${n}: ${amt.toFixed(2)} €`; ol.appendChild(li);
    });

    // Chart: kumulierte Summe über Zeit
    const pts = rows
      .map(r=> ({ t: new Date(r.ts || r.time || Date.now()), v: Number(r.amount)||0 }))
      .sort((a,b)=> a.t - b.t);
    let cum=0; const labels=[], values=[];
    pts.forEach(p=>{ cum += p.v; labels.push(p.t.toLocaleDateString()); values.push(cum); });
    renderChart(labels, values);
  }catch(e){ console.error(e); }
}
function renderChart(labels, values){
  const ctx = byId('chart').getContext('2d');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Akkumuliert (€)', data: values, fill:false }] },
    options:{ responsive:true, plugins:{ legend:{ display:true } } }
  });
}

// ---------- Detail (Tab2) ----------
async function refreshDetail(){
  try{
    const data = await apiGet({ view:'all' });
    if(!data.ok) throw new Error(data.error||'API-Fehler');
    const players = data.players || [];
    const rows = data.rows || [];

    // Spieler-Dropdown
    const sel = byId('filterPlayer'); sel.innerHTML = '';
    players.forEach(p=>{
      const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; sel.appendChild(o);
    });
    sel.onchange = ()=> fillDetail(rows, sel.value);
    if(players[0]) fillDetail(rows, players[0].name);
  }catch(e){ console.error(e); }
}
function fillDetail(rows, name){
  const body = byId('detailBody'); body.innerHTML='';
  rows.filter(r=> (r.name||'')===name).sort((a,b)=> String(b.ts).localeCompare(String(a.ts))).forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtDate(r.ts)}</td><td>${r.name}</td><td>${r.fine||r.offense||r.value}</td><td>${Number(r.amount||0).toFixed(2)}</td>`;
    body.appendChild(tr);
  });
}

// ---------- Erfassung (Tab3, Admin) ----------
async function loadStammdatenIntoEntry(){
  if ((localStorage.getItem(LS.role)||'') !== 'Admin') return;
  try{
    const data = await apiGet({ view:'meta' }); // players,fines
    if(!data.ok) throw new Error(data.error||'API-Fehler');
    const players = data.players||[], fines = data.fines||[];
    const selP = byId('entryPlayers'); selP.innerHTML='';
    players.forEach(p=>{ const o=document.createElement('option'); o.value=p.name; o.textContent=p.name; selP.appendChild(o); });
    const selF = byId('entryFine'); selF.innerHTML='';
    fines.forEach(f=>{ const o=document.createElement('option'); o.value=f.name; o.textContent=`${f.name} (${Number(f.amount||0).toFixed(2)} €)`; o.dataset.amount = Number(f.amount||0); selF.appendChild(o); });
  }catch(e){ console.error(e); }
}
byId('saveEntry').onclick = async ()=>{
  try{
    const selP = Array.from(byId('entryPlayers').selectedOptions).map(o=> o.value);
    const fineOpt = byId('entryFine').selectedOptions[0];
    const fineName = fineOpt?.value || '';
    const amount = Number(fineOpt?.dataset.amount || 0);
    const ts = byId('entryTs').value ? new Date(byId('entryTs').value).toISOString() : new Date().toISOString();
    if(!selP.length || !fineName){ throw new Error('Bitte Spieler und Strafe wählen'); }
    // pro Spieler ein POST
    for(const name of selP){
      await apiPost({ name, fine: fineName, amount, ts });
    }
    byId('msgEntry').textContent = 'Gespeichert.';
    setTimeout(()=> byId('msgEntry').textContent='', 1500);
  }catch(e){ alert(e.message||'Fehler'); }
};

// ---------- Stammdaten (Tab4, Admin) ----------
async function refreshStammdaten(){
  if ((localStorage.getItem(LS.role)||'') !== 'Admin') return;
  try{
    const data = await apiGet({ view:'meta' });
    if(!data.ok) throw new Error(data.error||'API-Fehler');
    renderPlayers(data.players||[]);
    renderFines(data.fines||[]);
  }catch(e){ console.error(e); }
}
function renderPlayers(list){
  const ul = byId('playersList'); ul.innerHTML='';
  list.sort((a,b)=> a.name.localeCompare(b.name)).forEach(p=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${p.name}</strong>
      <span class="right"></span>
      <button class="secondary" data-edit="${p.name}">Bearbeiten</button>
      <button class="danger" data-del="${p.name}">Löschen</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-edit]').forEach(btn=> btn.onclick = async ()=>{
    byId('playerName').value = btn.dataset.edit;
  });
  ul.querySelectorAll('[data-del]').forEach(btn=> btn.onclick = async ()=>{
    if(!confirm('Spieler löschen?')) return;
    await apiAdmin('delete_player', { name: btn.dataset.del });
    refreshStammdaten();
  });
}
function renderFines(list){
  const ul = byId('finesList'); ul.innerHTML='';
  list.sort((a,b)=> a.name.localeCompare(b.name)).forEach(f=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${f.name}</strong> – ${Number(f.amount||0).toFixed(2)} €
      <span class="right"></span>
      <button class="secondary" data-edit="${f.name}">Bearbeiten</button>
      <button class="danger" data-del="${f.name}">Löschen</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-edit]').forEach(btn=> btn.onclick = async ()=>{
    const item = list.find(x=> x.name===btn.dataset.edit);
    byId('fineName').value = item?.name || '';
    byId('fineAmount').value = item ? Number(item.amount||0) : '';
  });
  ul.querySelectorAll('[data-del]').forEach(btn=> btn.onclick = async ()=>{
    if(!confirm('Strafe löschen?')) return;
    await apiAdmin('delete_fine', { name: btn.dataset.del });
    refreshStammdaten();
  });
}
byId('addPlayer').onclick = async ()=>{
  const name = byId('playerName').value.trim(); if(!name) return alert('Name?');
  await apiAdmin('upsert_player', { name });
  byId('playerName').value=''; refreshStammdaten(); loadStammdatenIntoEntry();
};
byId('addFine').onclick = async ()=>{
  const name = byId('fineName').value.trim();
  const amount = Number(byId('fineAmount').value);
  if(!name || !Number.isFinite(amount)) return alert('Vergehen & Betrag?');
  await apiAdmin('upsert_fine', { name, amount });
  byId('fineName').value=''; byId('fineAmount').value=''; refreshStammdaten(); loadStammdatenIntoEntry();
};

// ---------- Config events ----------
byId('saveCfg').onclick = ()=> { saveCfg(); alert('Gespeichert'); };
byId('clearCfg').onclick = ()=> { clearCfg(); alert('Zurückgesetzt'); };

// Init
loadCfg();