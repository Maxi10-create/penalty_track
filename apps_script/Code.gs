// Code.gs — PenaltyTrack API (Daten + Players + Fines)
const SHEET_DATA = 'Daten';
const SHEET_PLAY = 'Players';
const SHEET_FINE = 'Fines';

function prop_(k){ return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function json_(o,c){ const x=ContentService.createTextOutput(JSON.stringify(o)); x.setMimeType(ContentService.MimeType.JSON); if(c) x.setResponseCode(c); return x; }

function sheet_(name, header){
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(header); }
  return sh;
}
function auth_(e, needAdmin){
  let api = e.parameter.apiKey || '', adm = e.parameter.adminKey || '';
  if (e.postData && e.postData.contents){
    try{ const b=JSON.parse(e.postData.contents); api=b.apiKey||api; adm=b.adminKey||adm; e._body=b; }catch(_){}
  }
  if (!prop_('API_KEY') || api !== prop_('API_KEY')) return {ok:false, code:401, msg:'unauthorized'};
  if (needAdmin && adm !== prop_('ADMIN_KEY')) return {ok:false, code:403, msg:'forbidden'};
  return {ok:true};
}

function doGet(e){
  const a = auth_(e,false); if(!a.ok) return json_({ok:false,error:a.msg}, a.code);
  const view = (e.parameter.view||'all').toLowerCase();

  const shD = sheet_(SHEET_DATA, ['id','name','fine','amount','ts']);
  const shP = sheet_(SHEET_PLAY, ['name']);
  const shF = sheet_(SHEET_FINE, ['name','amount']);

  const vals = shD.getDataRange().getValues(); const hD = vals.shift()||[];
  const rows = vals.map(r=> Object.fromEntries(hD.map((h,i)=>[h, r[i]])));

  const pVals = shP.getDataRange().getValues(); pVals.shift();
  const players = pVals.map(r=> ({name:r[0]}));

  const fVals = shF.getDataRange().getValues(); const hF = fVals.shift()||['name','amount'];
  const fines = fVals.map(r=> Object.fromEntries(hF.map((h,i)=>[h, r[i]]))).map(x=> ({ name:x.name, amount:Number(x.amount||0) }));

  if (view==='meta') return json_({ok:true, players, fines});
  return json_({ok:true, rows, players, fines});
}

function doPost(e){
  const action = (e.parameter.action||'').toLowerCase();

  if (!action){
    const a = auth_(e,false); if(!a.ok) return json_({ok:false,error:a.msg}, a.code);
    try{
      const b = e._body || JSON.parse(e.postData.contents||'{}');
      const id = b.id || Utilities.getUuid();
      const name = (b.name||'').toString();
      const fine = (b.fine||'').toString();
      const amount = Number(b.amount||0);
      const ts = (b.ts || new Date().toISOString()).toString();
      if(!name || !fine) return json_({ok:false,error:'missing name/fine'},400);
      const sh = sheet_(SHEET_DATA, ['id','name','fine','amount','ts']);
      sh.appendRow([id,name,fine,amount,ts]);
      return json_({ok:true,id});
    }catch(err){ return json_({ok:false,error:String(err)},500); }
  }

  // admin actions
  const a = auth_(e,true); if(!a.ok) return json_({ok:false,error:a.msg}, a.code);
  try{
    const b = e._body || JSON.parse(e.postData.contents||'{}');
    if (action==='delete_entry'){
      const id = (b.id||'').toString(); if(!id) return json_({ok:false,error:'missing id'},400);
      const sh = sheet_(SHEET_DATA, ['id','name','fine','amount','ts']);
      const vals = sh.getDataRange().getValues(); const header = vals.shift();
      const idx = header.reduce((m,h,i)=>(m[h]=i,m),{});
      for(let r=0;r<vals.length;r++){ if(String(vals[r][idx.id])===id){ sh.deleteRow(r+2); return json_({ok:true,deleted:id}); } }
      return json_({ok:false,error:'not found'},404);
    }
    if (action==='upsert_player'){
      const name = (b.name||'').toString(); if(!name) return json_({ok:false,error:'missing name'},400);
      const sh = sheet_(SHEET_PLAY, ['name']);
      const rng = sh.getDataRange(); const vals = rng.getValues(); vals.shift();
      // existiert? -> nichts doppelt
      for(let r=0;r<vals.length;r++){ if(String(vals[r][0])===name) return json_({ok:true,upsert:name}); }
      sh.appendRow([name]); return json_({ok:true,upsert:name});
    }
    if (action==='delete_player'){
      const name = (b.name||'').toString(); if(!name) return json_({ok:false,error:'missing name'},400);
      const sh = sheet_(SHEET_PLAY, ['name']); const vals = sh.getDataRange().getValues(); vals.shift();
      for(let r=0;r<vals.length;r++){ if(String(vals[r][0])===name){ sh.deleteRow(r+2); return json_({ok:true,deleted:name}); } }
      return json_({ok:false,error:'not found'},404);
    }
    if (action==='upsert_fine'){
      const name = (b.name||'').toString(); const amount = Number(b.amount||0);
      if(!name || !Number.isFinite(amount)) return json_({ok:false,error:'missing name/amount'},400);
      const sh = sheet_(SHEET_FINE, ['name','amount']);
      const vals = sh.getDataRange().getValues(); const header = vals.shift()||['name','amount'];
      const idx = header.reduce((m,h,i)=>(m[h]=i,m),{});
      for(let r=0;r<vals.length;r++){
        if(String(vals[r][idx.name])===name){ sh.getRange(r+2, idx.amount+1).setValue(amount); return json_({ok:true,upsert:name}); }
      }
      sh.appendRow([name, amount]); return json_({ok:true,upsert:name});
    }
    if (action==='delete_fine'){
      const name = (b.name||'').toString(); if(!name) return json_({ok:false,error:'missing name'},400);
      const sh = sheet_(SHEET_FINE, ['name','amount']); const vals = sh.getDataRange().getValues(); vals.shift();
      for(let r=0;r<vals.length;r++){ if(String(vals[r][0])===name){ sh.deleteRow(r+2); return json_({ok:true,deleted:name}); } }
      return json_({ok:false,error:'not found'},404);
    }
    return json_({ok:false,error:'unknown action'},400);
  }catch(err){ return json_({ok:false,error:String(err)},500); }
}