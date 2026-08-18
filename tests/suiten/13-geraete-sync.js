/* V80: Geräte-Sync muss drei Dinge gleichzeitig leisten:
   1. Der Tracker bleibt offline und lokal vollständig nutzbar.
   2. Supabase sieht weder Trainingsdaten noch den Kopplungsschlüssel.
   3. Zwei geänderte Stände überschreiben sich niemals still. */

const fs = require('fs');
const path = require('path');
const { js, warte } = require('../lib/browser');

exports.name = 'V80 verschlüsselter Geräte-Sync';
exports.optionen = process.env.APP_UNDER_TEST ? {datei:process.env.APP_UNDER_TEST} : {};

exports.lauf = async ({ page, p }) => {
  const statisch = await js(page, `(() => ({
    modal: !!document.querySelector('#modal-sync .modal[aria-labelledby="sync-title"]'),
    opener: !!document.querySelector('#sync-open'),
    input16: getComputedStyle(document.documentElement).getPropertyValue('--fs-input').trim(),
    statusText: document.querySelector('#sync-settings-state').textContent.trim(),
    crypto: syncCryptoOk(),
    localKey: LS_KEY,
    syncKey: SYNC_LS,
    publishable: /^sb_publishable_/.test(SYNC_PUBLISHABLE),
    secret: /service[_-]?role|sb_secret_/i.test(SYNC_PUBLISHABLE)
  }))()`);
  p.pruefe('Sync-Modal ist als Dialog beschriftet', statisch.modal);
  p.pruefe('Einstellungen haben einen sichtbaren Öffner', statisch.opener);
  p.gleich('Eingabeschrift bleibt 16 px', statisch.input16, '16px');
  p.enthaelt('Leerzustand sagt klar „nicht eingerichtet"', statisch.statusText, 'Nicht eingerichtet');
  p.pruefe('echtes WebCrypto ist verfügbar', statisch.crypto);
  p.gleich('Trainingsspeicher bleibt ironlog_v1', statisch.localKey, 'ironlog_v1');
  p.pruefe('Sync-Metadaten haben einen getrennten Schlüssel', statisch.syncKey !== statisch.localKey);
  p.pruefe('nur der öffentliche Publishable Key steckt in der App', statisch.publishable && !statisch.secret);
  const minus=await js(page, `(() => { try{return syncNormalizeCode('AAAA-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')}catch(_){return 'FEHLER'} })()`);
  p.gleich('gültiges Base64URL-Minus bleibt Teil des Schlüssels',minus,
    'AAAA-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

  /* ── Kryptografie: deterministische Kennung, zufälliger Chiffretext ── */
  const krypt = await js(page, `(async () => {
    const code=syncNewCode(), code2=syncNewCode();
    const a=await syncIdentity(code), a2=await syncIdentity(code), b=await syncIdentity(code2);
    const geheim={workouts:[{id:'w-geheim',date:'2026-08-18T18:00:00.000Z',type:'Push',
      exercises:[{exId:'x-brustpresse-maschine',name:'Brustpresse Geheim',sets:[{w:73.5,r:11}]}]}],
      settings:{name:'Aaron Geheim'},bodyweight:[],measures:[],goals:[],plan:{}};
    const e1=await syncEncryptState(geheim,code), e2=await syncEncryptState(geheim,code);
    const klar=(await syncDecryptRow({payload:e1.payload,iv:e1.iv},code)).state;
    let falsch=false, manipuliert=false;
    try{ await syncDecryptRow({payload:e1.payload,iv:e1.iv},code2); }catch(_){ falsch=true; }
    try{
      const p=e1.payload.slice(0,-1)+(e1.payload.endsWith('A')?'B':'A');
      await syncDecryptRow({payload:p,iv:e1.iv},code);
    }catch(_){ manipuliert=true; }
    return {len:code.length,id:a.syncId,id2:a2.syncId,fremd:b.syncId,
      anders:e1.payload!==e2.payload,plain:e1.payload.includes('Brustpresse')||e1.payload.includes('73.5'),
      name:klar.workouts[0].exercises[0].name,w:klar.workouts[0].exercises[0].sets[0].w,
      falsch,manipuliert,iv1:e1.iv,iv2:e2.iv};
  })()`);
  p.gleich('Kopplungsschlüssel enthält 256 Bit als 43 Zeichen', krypt.len, 43);
  p.gleich('derselbe Schlüssel ergibt dieselbe Zeilenkennung', krypt.id, krypt.id2);
  p.pruefe('ein anderer Schlüssel ergibt eine andere Kennung', krypt.id !== krypt.fremd);
  p.pruefe('dieselben Daten werden dank neuer IV jedes Mal anders verschlüsselt', krypt.anders && krypt.iv1 !== krypt.iv2);
  p.gleich('im Cloud-Payload steht kein Klartext', krypt.plain, false);
  p.gleich('Entschlüsselung stellt den Übungsnamen wieder her', krypt.name, 'Brustpresse Geheim');
  p.gleich('Entschlüsselung stellt das exakte Gewicht wieder her', krypt.w, 73.5);
  p.pruefe('ein fremder Schlüssel kann nicht entschlüsseln', krypt.falsch);
  p.pruefe('AES-GCM erkennt manipulierten Chiffretext', krypt.manipuliert);

  /* ── Ersteinrichtung: GET prüft Kollision, POST enthält nur Chiffre ── */
  const erstellt = await js(page, `(async () => {
    state.workouts=[{id:'sync-start',date:'2026-08-18T18:00:00.000Z',type:'Push',start:1,end:2,
      exercises:[{exId:'x-brustpresse-maschine',name:'NICHT_IN_DER_CLOUD_LESBAR',sets:[{w:61.25,r:9}]}],prs:[]}];
    saveState(); window.__syncCalls=[];
    window.fetch=async (url,opt={})=>{
      __syncCalls.push({url,method:opt.method,headers:Object.assign({},opt.headers),body:opt.body||''});
      const data=opt.method==='GET'?[]:[{revision:1,updated_at:'2026-08-18T18:01:00.000Z'}];
      return {ok:true,status:200,text:async()=>JSON.stringify(data)};
    };
    await syncCreate(); if(_syncTimer){clearTimeout(_syncTimer);_syncTimer=null;}
    const post=__syncCalls.find(x=>x.method==='POST'), body=JSON.parse(post.body);
    return {calls:__syncCalls.length,methods:__syncCalls.map(x=>x.method),connected:syncConnected(),
      revision:syncMeta.revision,dirty:syncMeta.dirty,code:syncMeta.code,syncId:syncMeta.syncId,
      headerId:post.headers['x-sync-id'],auth:post.headers.Authorization,api:post.headers.apikey,
      plain:post.body.includes('NICHT_IN_DER_CLOUD_LESBAR')||post.body.includes('61.25'),
      rawCode:JSON.stringify(__syncCalls).includes(syncMeta.code),payload:body.payload,iv:body.iv};
  })()`);
  p.gleich('Einrichtung macht genau Kollisionsprüfung + Anlage', erstellt.calls, 2);
  p.gleich('Reihenfolge ist GET, dann POST', erstellt.methods.join(','), 'GET,POST');
  p.pruefe('Gerät ist danach verbunden', erstellt.connected);
  p.gleich('erste Cloud-Revision ist 1', erstellt.revision, 1);
  p.gleich('nach erfolgreichem Upload ist nichts ungesichert', erstellt.dirty, false);
  p.gleich('Header trägt nur die abgeleitete Kennung', erstellt.headerId, erstellt.syncId);
  p.pruefe('der rohe Kopplungsschlüssel wird nie gesendet', !erstellt.rawCode);
  p.pruefe('POST enthält weder Übungsname noch Gewicht im Klartext', !erstellt.plain);
  p.pruefe('Anfrage nutzt ausschließlich den Publishable Key', /^sb_publishable_/.test(erstellt.api) && erstellt.auth==='Bearer '+erstellt.api);

  /* ── Offline: lokal speichern, kein Netzversuch, dirty bleibt erhalten ── */
  const offline = await js(page, `(async () => {
    state.settings.name='Offline Änderung'; saveState();
    if(_syncTimer){clearTimeout(_syncTimer);_syncTimer=null;}
    const vorher=__syncCalls.length;
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
    await syncNow(true);
    return {calls:__syncCalls.length-vorher,dirty:syncMeta.dirty,lokal:JSON.parse(localStorage.getItem(LS_KEY)).settings.name,
      status:syncStatus.text};
  })()`);
  p.gleich('offline wird keine Netzwerkanfrage versucht', offline.calls, 0);
  p.pruefe('ungesicherte Änderung bleibt markiert', offline.dirty);
  p.gleich('Änderung liegt trotzdem sofort in ironlog_v1', offline.lokal, 'Offline Änderung');
  p.gleich('Status nennt den Offline-Grund', offline.status, 'Offline');

  /* ── Konflikt: Cloud und Gerät geändert, kein stilles PATCH ───────── */
  const konflikt = await js(page, `(async () => {
    Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
    const code=syncMeta.code;
    /* Gemeinsame Basis ist der aktuelle lokale Stand. */
    syncMeta.lastHash=await syncStateHash(state); syncMeta.dirty=false; syncMeta.revision=1; syncSaveMeta();
    const remote=syncCloudState(state); remote.settings.name='Cloud Änderung';
    remote.workouts.push({id:'nur-cloud',date:'2026-08-18T19:00:00.000Z',type:'Pull',exercises:[],prs:[]});
    const enc=await syncEncryptState(remote,code);
    state.settings.name='Geräte Änderung'; state.workouts.push({id:'nur-lokal',date:'2026-08-18T19:05:00.000Z',type:'Pull',exercises:[],prs:[]}); saveState();
    if(_syncTimer){clearTimeout(_syncTimer);_syncTimer=null;}
    window.__syncCalls=[];
    window.fetch=async (url,opt={})=>{
      __syncCalls.push({url,method:opt.method,body:opt.body||''});
      const row={sync_id:syncMeta.syncId,payload:enc.payload,iv:enc.iv,revision:2,updated_at:'2026-08-18T19:06:00Z'};
      return {ok:true,status:200,text:async()=>JSON.stringify([row])};
    };
    await syncNow(true);
    return {name:state.settings.name,ids:state.workouts.map(w=>w.id),conflict:!!_syncConflict,
      patch:__syncCalls.some(x=>x.method==='PATCH'),status:syncStatus.text,
      snaps:snapshots().map(s=>({reason:s.reason,t:s.t}))};
  })()`);
  p.gleich('Konflikt überschreibt den lokalen Namen nicht', konflikt.name, 'Geräte Änderung');
  p.pruefe('lokales Workout bleibt erhalten', konflikt.ids.includes('nur-lokal'));
  p.pruefe('Cloud-Workout wird vor der Entscheidung nicht eingemischt', !konflikt.ids.includes('nur-cloud'));
  p.pruefe('Konfliktzustand ist ausdrücklich gesetzt', konflikt.conflict);
  p.gleich('bei Konflikt geht kein PATCH raus', konflikt.patch, false);
  p.gleich('Status verlangt eine Entscheidung', konflikt.status, 'Entscheidung nötig');
  p.pruefe('lokaler Stand bekam einen Sicherungspunkt', konflikt.snaps.some(x=>/dieses Gerät/.test(x.reason)));
  p.pruefe('Cloud-Stand bekam einen eigenen Sicherungspunkt', konflikt.snaps.some(x=>/Cloud/.test(x.reason)));
  p.gleich('beide Konfliktkopien haben eindeutige Wiederherstellungs-IDs',new Set(konflikt.snaps.map(x=>x.t)).size,konflikt.snaps.length);

  const cloudGewinnt = await js(page, `(async () => {
    ask=async()=>true; await syncUseCloud();
    return {name:state.settings.name,ids:state.workouts.map(w=>w.id),conflict:!!_syncConflict,
      revision:syncMeta.revision,dirty:syncMeta.dirty,gespeichert:JSON.parse(localStorage.getItem(LS_KEY)).settings.name};
  })()`);
  p.gleich('gewählter Cloud-Stand wird angewendet', cloudGewinnt.name, 'Cloud Änderung');
  p.pruefe('Cloud-Workout ist danach vorhanden', cloudGewinnt.ids.includes('nur-cloud'));
  p.pruefe('lokale Konfliktversion ist nicht in den aktiven Stand geraten', !cloudGewinnt.ids.includes('nur-lokal'));
  p.gleich('Konflikt ist danach aufgelöst', cloudGewinnt.conflict, false);
  p.gleich('übernommene Revision ist 2', cloudGewinnt.revision, 2);
  p.gleich('übernommener Stand ist auch lokal gespeichert', cloudGewinnt.gespeichert, 'Cloud Änderung');

  const ohneBasis = await js(page, `(async () => {
    const remote=syncCloudState(state), enc=await syncEncryptState(remote,syncMeta.code);
    syncMeta.lastHash=null; syncMeta.dirty=false; syncMeta.revision=2; syncSaveMeta();
    state.settings.name='Lokaler Stand ohne Basis';
    window.__syncCalls=[];
    window.fetch=async (url,opt={})=>{
      __syncCalls.push({url,method:opt.method});
      return {ok:true,status:200,text:async()=>JSON.stringify([{sync_id:syncMeta.syncId,payload:enc.payload,iv:enc.iv,revision:2,updated_at:'2026-08-18T19:06:00Z'}])};
    };
    await syncNow(true);
    return {name:state.settings.name,conflict:!!_syncConflict,patch:__syncCalls.some(x=>x.method==='PATCH')};
  })()`);
  p.gleich('fehlt die gemeinsame Basis, bleibt der lokale Stand unangetastet',ohneBasis.name,'Lokaler Stand ohne Basis');
  p.pruefe('fehlende Basis wird als Konflikt behandelt',ohneBasis.conflict);
  p.gleich('ohne beweisbare Basis wird niemals hochgeladen',ohneBasis.patch,false);
  await js(page, `(async()=>{ ask=async()=>true; await syncUseCloud(); })()`);

  /* ── Voller Browser-Speicher: ohne Sicherung kein Überschreiben ─── */
  const ohneLokaleSicherung = await js(page, `(async () => {
    const alt=makeSnapshotOf, vorher=state.settings.name;
    const remote=syncCloudState(state); remote.settings.name='DARF NICHT ÜBERNEHMEN';
    const remoteHash=await syncStateHash(remote);
    let fehler='';
    try{
      makeSnapshotOf=()=>false;
      await syncApplyRemote(remote,{revision:syncMeta.revision},remoteHash,'Test ohne Speicherplatz');
    }catch(e){ fehler=String(e&&e.message||e); }
    finally{ makeSnapshotOf=alt; }
    return {fehler,name:state.settings.name,vorher,
      gespeichert:JSON.parse(localStorage.getItem(LS_KEY)).settings.name,
      meldung:syncFriendlyError(new Error(fehler))};
  })()`);
  p.gleich('Cloud-Übernahme stoppt, wenn der lokale Sicherungspunkt scheitert',ohneLokaleSicherung.fehler,'SNAPSHOT');
  p.gleich('bei fehlendem Sicherungspunkt bleibt der aktive Stand unverändert',ohneLokaleSicherung.name,ohneLokaleSicherung.vorher);
  p.gleich('bei fehlendem Sicherungspunkt bleibt auch ironlog_v1 unverändert',ohneLokaleSicherung.gespeichert,ohneLokaleSicherung.vorher);
  p.enthaelt('Fehlermeldung sagt ausdrücklich, dass nichts überschrieben wurde',ohneLokaleSicherung.meldung,'Kein Stand wurde überschrieben');

  const ohneCloudSicherung = await js(page, `(async () => {
    const alt=makeSnapshotOf, remote=syncCloudState(state); remote.settings.name='Cloud vor Sicherungsfehler';
    const enc=await syncEncryptState(remote,syncMeta.code), row={sync_id:syncMeta.syncId,payload:enc.payload,
      iv:enc.iv,revision:syncMeta.revision,updated_at:'2026-08-18T19:06:00Z'};
    _syncConflict={remote,row,localHash:await syncStateHash(state),remoteHash:await syncStateHash(remote),snapshotsOk:false};
    window.__syncCalls=[];
    window.fetch=async (url,opt={})=>{
      __syncCalls.push({url,method:opt.method});
      return {ok:true,status:200,text:async()=>JSON.stringify([row])};
    };
    ask=async()=>true; makeSnapshotOf=()=>false;
    await syncKeepLocal();
    makeSnapshotOf=alt;
    const out={patch:__syncCalls.some(x=>x.method==='PATCH'),conflict:!!_syncConflict,
      name:state.settings.name,status:syncStatus.text,detail:syncStatus.detail};
    _syncConflict=null; syncMeta.dirty=false; syncSaveMeta();
    return out;
  })()`);
  p.gleich('lokaler Stand überschreibt Cloud nicht ohne Cloud-Sicherungspunkt',ohneCloudSicherung.patch,false);
  p.pruefe('der Konflikt bleibt nach gescheiterter Cloud-Sicherung offen',ohneCloudSicherung.conflict);
  p.gleich('der lokale aktive Stand bleibt dabei erhalten',ohneCloudSicherung.name,ohneLokaleSicherung.vorher);
  p.enthaelt('Status nennt den ungelösten Konflikt',ohneCloudSicherung.status,'Konflikt nicht gelöst');

  /* ── Normaler Push: Revision als Vergleichsbedingung ─────────────── */
  const push = await js(page, `(async () => {
    const basis=syncCloudState(state), old=await syncEncryptState(basis,syncMeta.code);
    syncMeta.lastHash=await syncStateHash(state); syncMeta.dirty=false; syncMeta.revision=2; syncSaveMeta();
    state.settings.name='Vom PC'; saveState(); if(_syncTimer){clearTimeout(_syncTimer);_syncTimer=null;}
    window.__syncCalls=[];
    window.fetch=async (url,opt={})=>{
      __syncCalls.push({url,method:opt.method,body:opt.body||''});
      if(opt.method==='GET') return {ok:true,status:200,text:async()=>JSON.stringify([{sync_id:syncMeta.syncId,payload:old.payload,iv:old.iv,revision:2,updated_at:'2026-08-18T19:06:00Z'}])};
      return {ok:true,status:200,text:async()=>JSON.stringify([{revision:3,updated_at:'2026-08-18T19:07:00Z'}])};
    };
    await syncNow(true); if(_syncTimer){clearTimeout(_syncTimer);_syncTimer=null;}
    const patch=__syncCalls.find(x=>x.method==='PATCH'), body=JSON.parse(patch.body);
    return {url:patch.url,revision:body.revision,plain:patch.body.includes('Vom PC'),meta:syncMeta.revision,
      dirty:syncMeta.dirty,methods:__syncCalls.map(x=>x.method).join(',')};
  })()`);
  p.gleich('normaler Abgleich liest erst und schreibt dann', push.methods, 'GET,PATCH');
  p.enthaelt('PATCH darf nur die erwartete alte Revision treffen', push.url, 'revision=eq.2');
  p.gleich('neue Revision wird auf 3 erhöht', push.revision, 3);
  p.gleich('Metadaten übernehmen Revision 3', push.meta, 3);
  p.pruefe('auch beim Update bleibt der Name verschlüsselt', !push.plain);
  p.gleich('erfolgreicher Push ist sauber', push.dirty, false);

  /* UI nach der Einrichtung: Schlüssel teilbar, Trennung zerstört nichts. */
  const ui = await js(page, `(() => {
    syncOpen();
    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
    const buttons=[...document.querySelectorAll('#modal-sync button')];
    return {readonly:document.querySelector('#sync-code-view').readOnly,
      copy:!!document.querySelector('#sync-copy'),now:!!document.querySelector('#sync-now'),
      dup:ids.filter((id,i)=>id&&ids.indexOf(id)!==i).length,
      unnamed:buttons.filter(b=>!(b.textContent||'').trim()&&!b.getAttribute('aria-label')).length};
  })()`);
  p.pruefe('Kopplungsschlüssel ist nur lesbar, nicht versehentlich editierbar', ui.readonly);
  p.pruefe('Kopieren und manueller Abgleich sind erreichbar', ui.copy && ui.now);
  p.gleich('Sync erzeugt keine doppelten IDs', ui.dup, 0);
  p.gleich('jeder Sync-Knopf hat einen zugänglichen Namen', ui.unnamed, 0);

  for(const [geraet,breite,hoehe] of [['iPad',820,1180],['PC',1366,768]]){
    await page.setViewportSize({width:breite,height:hoehe});
    const layout=await js(page, `(() => {
      closeModals(); statsPanel='all'; renderStats(); showScreen('scr-stats');
      syncOpen();
      const m=document.querySelector('#modal-sync .modal').getBoundingClientRect();
      /* .iconbtn ist sichtbar 36 px, erweitert die Trefferfläche aber per
         ::after auf 44 px; hier messen wir nur die normalen Textknöpfe. */
      const bs=[...document.querySelectorAll('#modal-sync button:not(.iconbtn)')].map(b=>({
        text:b.textContent.trim(),h:b.getBoundingClientRect().height,min:getComputedStyle(b).minHeight,cls:b.className}));
      return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        modal:m.width,viewport:innerWidth,buttons:bs,stats:document.querySelector('#stats-all').textContent.length,
        workouts:state.workouts.length};
    })()`);
    p.hoechstens(`${geraet}: keine horizontale Seite läuft aus dem Bildschirm`,layout.overflow,1);
    p.pruefe(`${geraet}: Sync-Modal bleibt vollständig in der Breite`,layout.modal<=layout.viewport);
    p.pruefe(`${geraet}: alle dynamischen Sync-Knöpfe sind mindestens 44 px hoch`,layout.buttons.every(x=>x.h>=44),JSON.stringify(layout.buttons));
    p.mind(`${geraet}: vollständige Statistik wird aus dem synchronisierten Stand gezeichnet`,layout.stats,500);
    p.mind(`${geraet}: synchronisierte Trainingsdaten sind vorhanden`,layout.workouts,1);
  }

  /* Das SQL ist Teil des überprüfbaren Projekts, enthält aber kein Geheimnis. */
  const sql=fs.readFileSync(path.join(__dirname,'..','..','SUPABASE-EINRICHTUNG.sql'),'utf8');
  p.enthaelt('RLS wird eingeschaltet', sql, 'enable row level security');
  p.enthaelt('Lesen ist an die x-sync-id gebunden', sql, 'sync_select_by_capability');
  p.enthaelt('Einfügen ist an die x-sync-id gebunden', sql, 'sync_insert_by_capability');
  p.enthaelt('Ändern ist an die x-sync-id gebunden', sql, 'sync_update_by_capability');
  p.pruefe('Cloud-Tabelle gibt kein DELETE an öffentliche Clients frei', !/grant[^;]*delete/i.test(sql));

  await warte(page,50);
};
