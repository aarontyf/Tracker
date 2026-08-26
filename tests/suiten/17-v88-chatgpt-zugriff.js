/* V88: Die ChatGPT-Freigabe ist absichtlich NICHT der Geräte-Sync.
   Getestet werden Datenminimierung, automatischer Upload und vollständiges
   Löschen der lesbaren Cloud-Kopie — ohne eine echte Supabase-Anfrage. */

const { js } = require('../lib/browser');

exports.name = 'V88 sicherer ChatGPT-Lesezugriff';
exports.optionen = process.env.APP_UNDER_TEST ? {datei:process.env.APP_UNDER_TEST} : {};

exports.lauf = async ({ page, p }) => {
  const statisch = await js(page, `(() => ({
    opener:!!document.querySelector('#ai-open'),
    dialog:!!document.querySelector('#modal-ai .modal[aria-labelledby="ai-title"]'),
    status:document.querySelector('#ai-settings-state').textContent.trim(),
    endpoint:AI_MCP_URL,
    getrennt:AI_LS!==SYNC_LS && AI_LS!==LS_KEY,
    version:document.querySelector('#modal-settings').textContent.includes('Fitness Tracker V88')
  }))()`);
  p.pruefe('Einstellungen haben einen sichtbaren ChatGPT-Öffner', statisch.opener);
  p.pruefe('Freigabe-Modal ist als Dialog beschriftet', statisch.dialog);
  p.enthaelt('Leerzustand sagt ausdrücklich „nicht freigegeben"', statisch.status, 'Nicht freigegeben');
  p.pruefe('MCP-Adresse ist ein stabiler HTTPS-Endpunkt', /^https:\/\/[^/]+\/functions\/v1\/gymtracker-mcp\/mcp$/.test(statisch.endpoint));
  p.pruefe('Freigabe-Metadaten sind von Trainings- und Sync-Speicher getrennt', statisch.getrennt);
  p.pruefe('Oberfläche zeigt V88', statisch.version);

  const bereinigt = await js(page, `(() => {
    const quelle={
      workouts:[{id:'w1',date:'2026-08-24T18:00:00Z',type:'Pull',rpe:8,note:'Trainingsnotiz',
        exercises:[{exId:'x1',name:'Klimmzug',note:'Übungsnotiz',as:true,bwkg:80,
          sets:[{w:20,r:6,rr:5,rir:1,ts:123,sek:90,dist:400,heimlich:'NEIN'}]}]}],
      active:null,bodyweight:[{d:'2026-08-24',kg:80}],
      measures:[{d:'2026-08-24',waist:82,privat:'NEIN'}],
      goals:[{id:'g1',art:'gewicht',exId:'x1',ziel:40,bis:'2026-12-01'}],
      plan:{'2026-08-26':{type:'Pull',exercises:[]}},templates:[],customEx:[],exOpt:{x1:{uni:true,rest:120}},
      settings:{name:'NAME_NIEMALS_TEILEN',vaultMail:'MAIL_NIEMALS_TEILEN@example.test',pin:'1234',
        goal:2,rest:90,repLo:6,repHi:9,defSets:2,setGoalLo:10,setGoalHi:20},
      profile:{alter:30,sex:'m',groesse:180,gewicht:80,kfa:15,ziel:'aufbau',erfahrung:'fortge',
        ort:'ORT_NIEMALS_TEILEN',alltag:'leicht',tage:4}
    };
    const s=aiBuildSnapshot(quelle), raw=JSON.stringify(s), set=s.state.workouts[0].exercises[0].sets[0];
    return {workouts:s.state.workouts.length,profile:s.trainingProfile,preferences:s.trainingPreferences,
      noSettings:!('settings' in s.state),noProfile:!('profile' in s.state),
      secrets:['NAME_NIEMALS_TEILEN','MAIL_NIEMALS_TEILEN','ORT_NIEMALS_TEILEN','1234'].every(x=>!raw.includes(x)),
      note:raw.includes('Trainingsnotiz')&&raw.includes('Übungsnotiz'),
      set:{sek:set.sek,dist:set.dist,rr:set.rr,rir:set.rir,extra:'heimlich' in set}};
  })()`);
  p.gleich('Workout-Anzahl bleibt erhalten', bereinigt.workouts, 1);
  p.pruefe('rohe Einstellungen und rohes Profil werden nie kopiert', bereinigt.noSettings && bereinigt.noProfile);
  p.pruefe('Name, Mail, Ort und PIN fehlen vollständig', bereinigt.secrets);
  p.pruefe('relevantes Profil bleibt unter neutralen Feldnamen erhalten', bereinigt.profile.weightKg===80 && bereinigt.profile.ageYears===30);
  p.pruefe('Trainingsvorgaben bleiben erhalten', bereinigt.preferences.repRange.min===6 && bereinigt.preferences.defaultSets===2);
  p.pruefe('Trainingsnotizen werden bewusst mitgeteilt', bereinigt.note);
  p.pruefe('Kardio, rechtsseitige Wdh und RIR bleiben exakt erhalten', bereinigt.set.sek===90 && bereinigt.set.dist===400 && bereinigt.set.rr===5 && bereinigt.set.rir===1);
  p.gleich('unbekanntes Satzfeld wird verworfen', bereinigt.set.extra, false);

  const upload = await js(page, `(async () => {
    const altClient=aiGetClient, altState=state;
    let row=null;
    const fake={auth:{getUser:async()=>({data:{user:{id:'00000000-0000-4000-8000-000000000001',email:'test@example.test'}},error:null})},
      from:()=>({upsert:async value=>{row=value;return {error:null}}})};
    aiGetClient=async()=>fake;
    state={workouts:[{id:'w-upload',date:'2026-08-24T18:00:00Z',type:'Push',exercises:[]}],
      settings:{name:'UPLOAD_SECRET',vaultMail:'secret@example.test'},profile:{ort:'UPLOAD_ORT'},
      active:null,bodyweight:[],measures:[],goals:[],plan:{},templates:[],customEx:[],exOpt:{}};
    aiMeta={enabled:true,dirty:true,lastUpload:null,workoutCount:0}; _aiReady=true; _aiBusy=false;
    await aiUploadNow(true,true);
    if(_aiTimer){clearTimeout(_aiTimer);_aiTimer=null;}
    const out={hasRow:!!row,user:row&&row.user_id,count:row&&row.workout_count,clean:row&&!JSON.stringify(row.payload).includes('UPLOAD_SECRET')&&!JSON.stringify(row.payload).includes('UPLOAD_ORT'),
      dirty:aiMeta.dirty,status:aiStatus.text};
    state=altState; aiGetClient=altClient; aiMeta={enabled:false,dirty:false,lastUpload:null,workoutCount:0}; aiUser=null;
    return out;
  })()`);
  p.pruefe('Upload schreibt genau eine nutzergebundene Zeile', upload.hasRow && upload.user==='00000000-0000-4000-8000-000000000001');
  p.gleich('Upload zählt die Workouts serverseitig nachvollziehbar mit', upload.count, 1);
  p.pruefe('auch der tatsächlich gesendete Payload ist bereinigt', upload.clean);
  p.gleich('erfolgreicher Upload ist nicht mehr als ausstehend markiert', upload.dirty, false);
  p.enthaelt('Status bestätigt die aktuelle Freigabe', upload.status, 'aktuell');

  const fernGeloescht = await js(page, `(async () => {
    const altClient=aiGetClient;
    let updates=0;
    const fake={auth:{getUser:async()=>({data:{user:{id:'u-stale'}},error:null})},from:()=>({
      update:()=>{updates++;return {eq:()=>({select:()=>({maybeSingle:async()=>({data:null,error:null})})})}}
    })};
    aiGetClient=async()=>fake; aiUser={id:'u-stale'};
    aiMeta={enabled:true,dirty:true,lastUpload:1,workoutCount:1}; _aiReady=true; _aiBusy=false;
    await aiUploadNow(true);
    const out={updates,enabled:aiMeta.enabled,lastUpload:aiMeta.lastUpload,status:aiStatus.detail};
    aiGetClient=altClient;
    return out;
  })()`);
  p.gleich('automatischer Abgleich versucht nur ein vorhandenes Snapshot-Update', fernGeloescht.updates, 1);
  p.gleich('auf anderem Gerät gelöschte Freigabe bleibt aus', fernGeloescht.enabled, false);
  p.gleich('veralteter lokaler Cloud-Verweis wird entfernt', fernGeloescht.lastUpload, null);
  p.enthaelt('Status erklärt die geräteübergreifende Löschung', fernGeloescht.status, 'anderen Gerät gelöscht');

  const geloescht = await js(page, `(async () => {
    const altClient=aiGetClient, altAsk=ask;
    let deleted='';
    const fake={auth:{getUser:async()=>({data:{user:{id:'u-delete'}},error:null}),oauth:{listGrants:async()=>({data:[],error:null})}},
      from:()=>({delete:()=>({eq:async(key,value)=>{deleted=key+'='+value;return {error:null}}})})};
    aiGetClient=async()=>fake; ask=async()=>true; aiUser={id:'u-delete',email:'test@example.test'};
    aiMeta={enabled:true,dirty:false,lastUpload:1,workoutCount:1}; _aiReady=true; _aiBusy=false;
    await aiDisable();
    const out={deleted,enabled:aiMeta.enabled,lastUpload:aiMeta.lastUpload,user:aiUser};
    aiGetClient=altClient; ask=altAsk;
    return out;
  })()`);
  p.gleich('Beenden löscht nur die eigene Cloud-Zeile', geloescht.deleted, 'user_id=u-delete');
  p.gleich('Freigabe ist erst nach erfolgreichem DELETE aus', geloescht.enabled, false);
  p.gleich('lokaler Verweis auf die Cloud-Kopie ist entfernt', geloescht.lastUpload, null);
  p.pruefe('Konto bleibt angemeldet, damit OAuth-Token widerrufen werden können', !!geloescht.user);

  const widerrufen = await js(page, `(async () => {
    const altClient=aiGetClient, altAsk=ask;
    let optionen=null;
    const fake={auth:{oauth:{
      revokeGrant:async opts=>{optionen=opts;return {error:null}},
      listGrants:async()=>({data:[],error:null})
    }}};
    aiGetClient=async()=>fake; ask=async()=>true;
    aiGrants=[{client:{id:'client-1',name:'ChatGPT'}}]; _aiBusy=false;
    await aiRevoke('client-1');
    const out={clientId:optionen&&optionen.clientId,rest:aiGrants.length};
    aiGetClient=altClient; ask=altAsk;
    return out;
  })()`);
  p.gleich('Widerruf übergibt die konkrete OAuth-Client-ID', widerrufen.clientId, 'client-1');
  p.gleich('widerrufene OAuth-Anwendung verschwindet aus der Liste', widerrufen.rest, 0);
};
