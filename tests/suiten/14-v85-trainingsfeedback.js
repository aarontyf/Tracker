/* V85: vor, während und nach dem Training entsteht eine zusammenhängende
   Feedback-Schleife — Erholungsschätzung, Live-Fortschritt und Session-RPE. */

const { js } = require('../lib/browser');

exports.name = 'V85 Trainingsfeedback';

exports.lauf = async ({ page, p }) => {
  const live = await js(page, `(() => {
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)');
    const now=Date.now();
    state.workouts=[{
      id:'v85-recent',date:new Date(now-2*3600000).toISOString(),type:'Push',
      start:now-3*3600000,end:now-2*3600000,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:Array.from({length:5},()=>({w:70,r:8}))}]
    }];
    state.active=null;
    state.plan={[heuteIso()]:{type:suggestType(),exercises:[{exId:ex.id,sets:[{w:70},{w:70},{w:70}]}]}};
    saveState(); renderVorschlag();
    const rec=vorschlagErholung([{exId:ex.id}],now);
    const ready=document.querySelector('#home-suggest .readycue');

    state.active={id:'v85-live',date:new Date(now).toISOString(),start:now,type:'Push',
      exercises:[{exId:ex.id,name:ex.name,__live:true,sets:[
        {w:30,r:8,t:'w'},{w:70,r:8},{w:'',r:''},{w:'',r:'',t:'d'}
      ]}]};
    renderActive();
    const prog=activeProgress(), meter=document.querySelector('#tw-progress');
    return {
      recAvg:rec.avg,recMin:rec.min.name,recStatus:rec.status,
      ready:!!ready,readyText:ready?ready.textContent:'',
      done:prog.done,total:prog.total,pct:prog.pct,
      count:document.querySelector('#tw-setcount').textContent,
      ariaNow:meter.getAttribute('aria-valuenow'),ariaMax:meter.getAttribute('aria-valuemax'),
      width:meter.querySelector('i').style.width
    };
  })()`);

  p.zwischen('Erholungsschätzung bleibt in einem echten Prozentbereich', live.recAvg, 0, 100);
  p.pruefe('frisch trainierte Brust wird nicht als voll erholt bezeichnet', live.recAvg < 80, live.recAvg);
  p.gleich('zusammengelegte Brustregion heißt verständlich Brust', live.recMin, 'Brust');
  p.pruefe('Vorschlagskarte zeigt den Erholungs-Hinweis', live.ready);
  p.enthaelt('Erholungs-Hinweis nennt seine Datengrundlage', live.readyText, 'Arbeitssätzen');
  p.enthaelt('Erholungs-Hinweis grenzt sich von HRV ab', live.readyText, 'HRV');
  p.gleich('Aufwärmsätze zählen nicht zum geplanten Arbeitsfortschritt', live.total, 3);
  p.gleich('nur der ausgefüllte Arbeitssatz ist erledigt', live.done, 1);
  p.gleich('Kopfzeile zeigt erledigt gegen geplant', live.count, '1/3 Sätze');
  p.gleich('Fortschrittsbalken hat den richtigen zugänglichen Istwert', live.ariaNow, '1');
  p.gleich('Fortschrittsbalken hat den richtigen zugänglichen Zielwert', live.ariaMax, '3');
  p.gleich('sichtbarer Fortschritt entspricht einem Drittel', live.width, '33%');

  const checkin = await js(page, `(() => {
    closeModals();
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)');
    const now=Date.now();
    const w={id:'v85-checkin',date:new Date(now).toISOString(),type:'Push',
      start:now-60*60000,end:now,durFix:60*60000,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:75,r:8}]}]};
    state.workouts=[w]; state.active=null; saveState();
    const direkt=sessionLoad({...w,rpe:8});
    showSummary(w,[],0);
    const vorher=document.querySelectorAll('[data-sum-rpe].on').length;
    const btn=document.querySelector('[data-sum-rpe="9"]');
    const hit=Math.round(btn.getBoundingClientRect().height);
    btn.click();
    const note=document.querySelector('#sum-session-note');
    note.value='Gute Technik, nächstes Mal 77,5 kg.';
    note.dispatchEvent(new Event('input',{bubbles:true}));
    note.dispatchEvent(new Event('change',{bubbles:true}));
    return {direkt,vorher,rpe:w.rpe,note:w.note,load:sessionLoad(w),hit,
      value:document.querySelector('#sum-rpe-value').textContent,
      loadText:document.querySelector('#sum-session-load').textContent,
      pressed:btn.getAttribute('aria-pressed')};
  })()`);

  p.gleich('Session-Load rechnet Dauer in Minuten mal RPE', checkin.direkt, 480);
  p.gleich('die Zusammenfassung erfindet keine Standardbewertung', checkin.vorher, 0);
  p.gleich('RPE-Tipp wird am Workout gespeichert', checkin.rpe, 9);
  p.gleich('Session-Notiz wird am Workout gespeichert', checkin.note, 'Gute Technik, nächstes Mal 77,5 kg.');
  p.gleich('Session-Load aktualisiert sich direkt', checkin.load, 540);
  p.mind('RPE-Zahlen haben ein handytaugliches Touchziel', checkin.hit, 44);
  p.enthaelt('ausgewählte Bewertung wird ausgeschrieben', checkin.value, '9/10');
  p.enthaelt('Belastung erscheint sofort in der Zusammenfassung', checkin.loadText, '540');
  p.gleich('ausgewählte Bewertung ist für Hilfstechnik markiert', checkin.pressed, 'true');

  const statistik = await js(page, `(async()=>{
    closeModals();
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)');
    const now=Date.now();
    const mins=[40,50,60], rpes=[6,7,8];
    const schritte=[{type:'Push',variant:'A'},{type:'Pull',variant:'A'},{type:'Push',variant:'B'}];
    state.workouts=mins.map((min,i)=>{
      const start=now-(3-i)*86400000;
      return {id:'v85-load-'+i,date:new Date(start).toISOString(),type:schritte[i].type,variant:schritte[i].variant,
        start,end:start+min*60000,durFix:min*60000,rpe:rpes[i],prs:[],
        note:i===2?'Schulter stabil, Tempo gut.':'',
        exercises:[{exId:ex.id,name:ex.name,sets:[{w:70+i*2.5,r:8}]}]};
    });
    saveState(); statsPanel='overview'; renderStats();
    const box=document.querySelector('#stats-overview');
    const loadCard=[...box.querySelectorAll('.card')].find(x=>/Belastungstrend/.test(x.textContent));
    const trend={text:box.textContent,svg:!!(loadCard&&loadCard.querySelector('svg'))};
    renderHist();
    const hist=document.querySelector('#hist-list').textContent;
    openWEdit('v85-load-2');
    const vor={rpe:document.querySelector('#we-rpe').value,note:document.querySelector('#we-session-note').value};
    const sel=document.querySelector('#we-rpe'); sel.value='6'; sel.dispatchEvent(new Event('change',{bubbles:true}));
    const note=document.querySelector('#we-session-note'); note.value='Tempo beibehalten.'; note.dispatchEvent(new Event('input',{bubbles:true}));
    await weSpeichern();
    const saved=state.workouts.find(w=>w.id==='v85-load-2');
    let blob=null;
    const oldCreate=URL.createObjectURL, oldRevoke=URL.revokeObjectURL, oldClick=HTMLAnchorElement.prototype.click;
    URL.createObjectURL=b=>{ blob=b; return 'blob:v85-test'; };
    URL.revokeObjectURL=()=>{};
    HTMLAnchorElement.prototype.click=function(){};
    document.querySelector('#btn-csv').click();
    const csv=blob?await blob.text():'';
    URL.createObjectURL=oldCreate; URL.revokeObjectURL=oldRevoke; HTMLAnchorElement.prototype.click=oldClick;
    return {trend,hist,vor,csv,saved:{rpe:saved.rpe,note:saved.note,load:sessionLoad(saved)}};
  })()`);

  p.enthaelt('Statistik integriert den neuen Belastungstrend', statistik.trend.text, 'Belastungstrend');
  p.enthaelt('Statistik erklärt die Session-Load-Formel', statistik.trend.text, 'Dauer × Session-RPE');
  p.pruefe('Belastungstrend wird als Diagramm gezeichnet', statistik.trend.svg);
  p.enthaelt('Verlauf zeigt die Session-RPE', statistik.hist, 'RPE 8');
  p.enthaelt('Verlauf zeigt die Session-Notiz', statistik.hist, 'Schulter stabil');
  p.gleich('Editor übernimmt die vorhandene Session-RPE', statistik.vor.rpe, '8');
  p.gleich('Editor übernimmt die vorhandene Session-Notiz', statistik.vor.note, 'Schulter stabil, Tempo gut.');
  p.gleich('Editor speichert eine geänderte Session-RPE', statistik.saved.rpe, 6);
  p.gleich('Editor speichert eine geänderte Session-Notiz', statistik.saved.note, 'Tempo beibehalten.');
  p.gleich('Belastung wird nach der Bearbeitung neu berechnet', statistik.saved.load, 360);
  p.enthaelt('CSV-Export enthält eine Session-RPE-Spalte', statistik.csv, 'Session_RPE');
  p.enthaelt('CSV-Export enthält die Session-Notiz', statistik.csv, 'Tempo beibehalten.');
};
