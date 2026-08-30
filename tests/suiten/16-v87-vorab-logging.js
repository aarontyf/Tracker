/* V87: Ein ausgewählter künftiger Tag bleibt beim vollständigen Logging
   erhalten. Das Workout darf weder auf heute zurückfallen noch vorzeitig
   den heutigen Zyklus, Timer oder die Erfolge verändern. */

const { js } = require('../lib/browser');

exports.name = 'V87 Vorab-Logging';

exports.lauf = async ({ page, p }) => {
  const start = await js(page, `(() => {
    closeModals();
    state.workouts=[]; state.plan={}; state.templates=[]; state.active=null;
    state.ach={}; restEnd=null; saveState();
    const morgen=tagPlus(heuteIso(),1);
    const ex=EXDB.find(e=>e.art==='kraft' && !exIsBW(e.id) && !exIsAssist(e.id));
    setPlan(morgen,{type:'Pull',exercises:[{exId:ex.id,name:ex.name,sets:[
      {w:42.5,r:''},{w:42.5,r:''},{w:42.5,r:''}
    ]}]});
    dsSpringe(morgen);
    const knopf=document.querySelector('#plan-start');
    const label=knopf&&knopf.textContent.trim();
    if(knopf) knopf.click();
    return {
      morgen, label,
      aktivTag:state.active&&isoTag(state.active.date),
      vorab:!!(state.active&&state.active.vorab),
      saetze:state.active&&state.active.exercises[0].sets.length,
      gewichte:state.active&&state.active.exercises[0].sets.map(s=>+s.w),
      kopf:(document.querySelector('#tw-date')||{}).textContent||'',
      zyklen:cycles().length
    };
  })()`);

  p.enthaelt('künftiger Tag bietet einen eindeutigen Eintragen-Knopf',start.label,'eintragen');
  p.gleich('ausgewählter Folgetag bleibt am aktiven Workout',start.aktivTag,start.morgen);
  p.gleich('aktives Workout ist als Vorab-Eintrag markiert',start.vorab,true);
  p.gleich('geplante Anzahl der Sätze wird übernommen',start.saetze,3);
  p.pruefe('Gewicht wird in jeden Satz übernommen',start.gewichte.every(x=>x===42.5),start.gewichte);
  p.enthaelt('Kopfzeile zeigt sichtbar den Folgetag',start.kopf,'Morgen');
  p.gleich('künftiger Eintrag schaltet den heutigen Zyklus nicht weiter',start.zyklen,0);

  const eingabe = await js(page, `(() => {
    const rows=[...document.querySelectorAll('#tw-exlist .setrow')];
    rows.forEach((row,i)=>{
      const inp=row.querySelector('[data-f=r]');
      inp.value=String(8-i); inp.dispatchEvent(new Event('input',{bubbles:true}));
    });
    return {
      reps:state.active.exercises[0].sets.map(s=>+s.r),
      stempel:state.active.exercises[0].sets.filter(s=>s.ts).length,
      pause:restEnd,
      timer:(document.querySelector('#tw-timer')||{}).textContent||''
    };
  })()`);

  p.pruefe('Wiederholungen lassen sich vollständig vorab erfassen',eingabe.reps.join(',')==='8,7,6',eingabe.reps);
  p.gleich('Vorab-Eingabe erfindet keine Satz-Zeitstempel',eingabe.stempel,0);
  p.gleich('Vorab-Eingabe startet keinen Pausen-Timer',eingabe.pause,null);
  p.enthaelt('Trainings-Timer kennzeichnet den Vorab-Modus',eingabe.timer,'Vorab');

  const fertig = await js(page, `(async()=>{
    const originalAsk=ask; ask=async()=>true;
    try{ await finishWorkout(); } finally { ask=originalAsk; }
    closeModals();
    const w=state.workouts[0];
    dsSpringe(tagPlus(heuteIso(),1));
    return {
      tag:isoTag(w.date), erwartet:tagPlus(heuteIso(),1), vorab:!!w.vorab,
      start:w.start, ende:w.end, stempel:w.exercises[0].sets.filter(s=>s.ts).length,
      tagText:(document.querySelector('#ds-body')||{}).textContent||'',
      zyklen:cycles().length, workoutsHeute:workoutsBisHeute().length,
      achievements:Object.keys(state.ach||{}).length,
      historieJetzt:exHistory(w.exercises[0].exId).length,
      figurFrisch:figFresh
    };
  })()`);

  p.gleich('gespeichertes Workout zählt zum Folgetag',fertig.tag,fertig.erwartet);
  p.gleich('gespeicherter Datensatz behält die Vorab-Kennzeichnung',fertig.vorab,true);
  p.gleich('Vorab-Datensatz enthält keine falsche Startzeit',fertig.start,null);
  p.gleich('Vorab-Datensatz enthält keine falsche Endzeit',fertig.ende,null);
  p.gleich('gespeicherte Sätze enthalten keine falschen Zeitstempel',fertig.stempel,0);
  p.enthaelt('Tagesansicht bestätigt die Zuordnung sichtbar',fertig.tagText,'vorab eingetragen');
  p.gleich('Vorab-Workout zählt vor seinem Tag nicht in den heutigen Zyklus',fertig.zyklen,0);
  p.gleich('Vorab-Workout zählt vor seinem Tag nicht als heutiges Workout',fertig.workoutsHeute,0);
  p.gleich('Vorab-Workout schaltet keine Erfolge zu früh frei',fertig.achievements,0);
  p.gleich('Vorab-Workout verändert vor seinem Tag keine Progressionshistorie',fertig.historieJetzt,0);
  p.gleich('Vorab-Workout markiert Muskeln nicht als gerade trainiert',fertig.figurFrisch,null);

  const vorlage = await js(page, `(() => {
    closeModals(); state.active=null; state.plan={};
    const ex=EXDB.find(e=>e.art==='kraft');
    state.templates=[{id:'morgen-vorlage',name:'Morgen',type:'Push',variant:'A',exIds:[ex.id]}];
    const morgen=tagPlus(heuteIso(),1); dsSpringe(morgen);
    const b=document.querySelector('[data-plan-tpl="morgen-vorlage"]');
    const label=b&&b.textContent.trim(); if(b) b.click();
    const plan=planAmTag(morgen);
    return {label,aktiv:state.active,tag:plan&&morgen,typ:plan&&einheitLabel(plan),
      uebungen:plan&&plan.exercises.length,wahl:dsWahl,naechster:tagPlus(morgen,1),morgen};
  })()`);
  p.gleich('Vorlagen-Knopf plant einen künftigen Tag',vorlage.label,'Planen');
  p.gleich('künftige Vorlage blockiert keinen aktiven Workout-Slot',vorlage.aktiv,null);
  p.gleich('Vorlage bleibt dem ausgewählten Tag zugeordnet',vorlage.tag,vorlage.morgen);
  p.gleich('Vorlage bewahrt die A/B-Variante',vorlage.typ,'Push A');
  p.gleich('Vorlage übernimmt ihre Übungen in den Tagesplan',vorlage.uebungen,1);
  p.gleich('nach dem Planen ist direkt der Folgetag gewählt',vorlage.wahl,vorlage.naechster);
};
