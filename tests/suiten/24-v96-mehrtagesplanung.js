/* V97 erweitert die V96-Mehrtagesplanung: Jeder Tag wird im identischen
   Satz-fuer-Satz-Editor des laufenden Trainings geplant. Erst Speichern
   schreibt state.plan; absolvierte Workouts und Statistiken bleiben leer. */

const { js } = require('../lib/browser');

exports.name = 'V97 Mehrtagesplanung im Workout-Editor';

exports.lauf = async ({ page, p }) => {
  const geplant = await js(page, `(() => {
    closeModals();
    state.workouts=[]; state.plan={}; state.active=null; restEnd=null;
    const kraft=EXDB.filter(e=>e.art==='kraft'&&!exIsBW(e.id)&&!exIsAssist(e.id));
    const exA=kraft[0], exB=kraft.find(e=>e.id!==exA.id);
    state.templates=[
      {id:'tpl-push-a',name:'Push A',type:'Push',variant:'A',exIds:[exA.id]},
      {id:'tpl-pull-a',name:'Pull A',type:'Pull',variant:'A',exIds:[exB.id]}
    ];
    saveState();
    const montag=tagPlus(heuteIso(),1), dienstag=tagPlus(montag,1);
    dsSpringe(montag);
    const erster=document.querySelector('[data-plan-tpl="tpl-push-a"]');
    if(erster) erster.click();
    const row=document.querySelector('#tw-exlist .setrow');
    const w=row&&row.querySelector('[data-f=w]'), r=row&&row.querySelector('[data-f=r]');
    if(w){ w.value='57.5'; w.dispatchEvent(new Event('input',{bubbles:true})); }
    if(r){ r.value='8'; r.dispatchEvent(new Event('input',{bubbles:true})); }
    const add=document.querySelector('[data-addset="0"]'); if(add) add.click();
    const editor={
      planung:!!(state.active&&state.active.planung), tag:state.active&&isoTag(state.active.date),
      typ:state.active&&einheitLabel(state.active),
      aktivSichtbar:getComputedStyle(document.querySelector('#train-active')).display!=='none',
      idleSichtbar:getComputedStyle(document.querySelector('#train-idle')).display!=='none',
      excards:document.querySelectorAll('#tw-exlist .excard').length,
      setrows:document.querySelectorAll('#tw-exlist .setrow').length,
      addEx:!!document.querySelector('#btn-add-ex'),
      speichern:(document.querySelector('#btn-finish')||{}).textContent||'',
      schliessen:(document.querySelector('#btn-cancel-w')||{}).textContent||'',
      timer:(document.querySelector('#tw-timer')||{}).textContent||'',
      restDisabled:!!(document.querySelector('#btn-rest')||{}).disabled,
      stempel:state.active.exercises[0].sets.filter(s=>s.ts).length,
      pause:restEnd,
      vorSave:planAmTag(montag), workouts:state.workouts.length
    };
    document.querySelector('#btn-finish').click();
    const pMo=planAmTag(montag);
    const nachMontag={
      aktiv:state.active, wahl:dsWahl, typ:pMo&&einheitLabel(pMo),
      gewicht:pMo&&+pMo.exercises[0].sets[0].w,
      reps:pMo&&+pMo.exercises[0].sets[0].r,
      saetze:pMo&&pMo.exercises[0].sets.length
    };

    const zweiter=document.querySelector('[data-plan-tpl="tpl-pull-a"]');
    if(zweiter) zweiter.click();
    const row2=document.querySelector('#tw-exlist .setrow');
    const w2=row2&&row2.querySelector('[data-f=w]');
    if(w2){ w2.value='42'; w2.dispatchEvent(new Event('input',{bubbles:true})); }
    document.querySelector('#btn-finish').click();
    const pDi=planAmTag(dienstag);
    return {
      montag,dienstag,editor,nachMontag,
      aktiv:state.active, wahl:dsWahl, erwarteteWahl:tagPlus(dienstag,1),
      labels:[einheitLabel(pMo),einheitLabel(pDi)],
      exIds:[pMo.exercises[0].exId,pDi.exercises[0].exId],
      planKeys:Object.keys(state.plan).sort(), workoutCount:state.workouts.length
    };
  })()`);

  p.gleich('Planen öffnet einen ausdrücklich markierten Planeditor',geplant.editor.planung,true);
  p.gleich('Planeditor gehört zum gewählten Montag',geplant.editor.tag,geplant.montag);
  p.gleich('A/B-Variante ist schon im Editor korrekt',geplant.editor.typ,'Push A');
  p.gleich('Planung zeigt denselben aktiven Workout-Bildschirm',geplant.editor.aktivSichtbar,true);
  p.gleich('kompakter alter Planer ist währenddessen ausgeblendet',geplant.editor.idleSichtbar,false);
  p.gleich('Planung benutzt dieselben Übungskarten',geplant.editor.excards,1);
  p.pruefe('Planung benutzt dieselben Satzzeilen und Satz-hinzufügen-Aktion',geplant.editor.setrows>=2,geplant.editor.setrows);
  p.gleich('Übung hinzufügen bleibt im identischen Editor verfügbar',geplant.editor.addEx,true);
  p.enthaelt('Abschlussaktion ist eindeutig Plan speichern',geplant.editor.speichern,'Plan speichern');
  p.enthaelt('Abbruchaktion spricht von Planung',geplant.editor.schliessen,'Planung');
  p.enthaelt('Trainingsuhr kennzeichnet stattdessen die Planung',geplant.editor.timer,'Planung');
  p.gleich('Pausen-Timer ist im Planer deaktiviert',geplant.editor.restDisabled,true);
  p.gleich('geplante Wiederholungen erzeugen keinen Satz-Zeitstempel',geplant.editor.stempel,0);
  p.gleich('geplante Wiederholungen starten keinen Pausen-Timer',geplant.editor.pause,null);
  p.gleich('vor Plan speichern existiert noch kein Tagesplan',geplant.editor.vorSave,null);
  p.gleich('reine Planung erzeugt kein absolviertes Workout',geplant.editor.workouts,0);

  p.gleich('Montag wird erst beim Speichern als Push A gesichert',geplant.nachMontag.typ,'Push A');
  p.gleich('geplantes Gewicht wird Satz fuer Satz gespeichert',geplant.nachMontag.gewicht,57.5);
  p.gleich('geplantes Wiederholungsziel wird gespeichert',geplant.nachMontag.reps,8);
  p.gleich('hinzugefügte Satzzeile bleibt Teil des Plans',geplant.nachMontag.saetze,geplant.editor.setrows);
  p.gleich('nach Montag ist Dienstag direkt ausgewählt',geplant.nachMontag.wahl,geplant.dienstag);
  p.gleich('Speichern gibt den aktiven Editor wieder frei',geplant.nachMontag.aktiv,null);
  p.gleich('Montag und Dienstag behalten verschiedene A/B-Einheiten',geplant.labels.join(' → '),'Push A → Pull A');
  p.pruefe('beide Tage behalten ihre eigenen Übungen',geplant.exIds[0]!==geplant.exIds[1],geplant.exIds);
  p.gleich('genau beide Kalendertage sind im Plan gespeichert',geplant.planKeys.join(','),[geplant.montag,geplant.dienstag].sort().join(','));
  p.gleich('nach Dienstag ist der nächste Tag bereit',geplant.wahl,geplant.erwarteteWahl);
  p.gleich('auch zwei gespeicherte Pläne erzeugen kein Workout',geplant.workoutCount,0);

  const abbrechen = await js(page, `(async()=>{
    const montag=tagPlus(heuteIso(),1), original=JSON.stringify(planAmTag(montag));
    dsSpringe(montag); document.querySelector('#plan-edit').click();
    const inp=document.querySelector('#tw-exlist [data-f=w]');
    inp.value='99'; inp.dispatchEvent(new Event('input',{bubbles:true}));
    const waehrend=+planAmTag(montag).exercises[0].sets[0].w;
    const originalAsk=ask; ask=async()=>true;
    document.querySelector('#btn-cancel-w').click();
    await new Promise(r=>setTimeout(r,0)); ask=originalAsk;
    return {waehrend,nachher:JSON.stringify(planAmTag(montag)),original,aktiv:state.active};
  })()`);
  p.gleich('Bearbeiten verändert den gespeicherten Plan noch nicht',abbrechen.waehrend,57.5);
  p.gleich('Planung schließen lässt den bisherigen Plan vollständig unverändert',abbrechen.nachher,abbrechen.original);
  p.gleich('nach Schließen ist kein Planentwurf mehr aktiv',abbrechen.aktiv,null);

  const start = await js(page, `(() => {
    const montag=tagPlus(heuteIso(),1); dsSpringe(montag);
    document.querySelector('#plan-start').click();
    const reps=state.active.exercises[0].sets.map(s=>s.r);
    const erste=document.querySelector('#tw-exlist [data-f=r]');
    return {
      planung:!!state.active.planung, vorab:!!state.active.vorab,
      reps,placeholder:erste&&erste.getAttribute('placeholder'),
      gewicht:+state.active.exercises[0].sets[0].w,
      logged:totalActiveSets(),workouts:state.workouts.length,
      planReps:+planAmTag(montag).exercises[0].sets[0].r
    };
  })()`);
  p.gleich('gespeicherten Plan starten öffnet ein echtes Workout',start.planung,false);
  p.gleich('künftiges echtes Workout bleibt als Vorab-Eintrag markiert',start.vorab,true);
  p.pruefe('geplante Wiederholungen werden nicht als absolviert vorgefüllt',start.reps.every(x=>x===''),start.reps);
  p.gleich('Wiederholungsziel bleibt als Platzhalter sichtbar',start.placeholder,'8');
  p.gleich('geplantes Arbeitsgewicht wird übernommen',start.gewicht,57.5);
  p.gleich('kein geplanter Satz zählt als geloggt',start.logged,0);
  p.gleich('Starten allein erzeugt noch kein Workout',start.workouts,0);
  p.gleich('der gespeicherte Plan behält sein Wiederholungsziel',start.planReps,8);

  const kardio = await js(page, `(() => {
    state.active=null; state.plan={}; state.workouts=[]; restEnd=null;
    const ex=EXDB.find(e=>e.art==='kardio'), tag=tagPlus(heuteIso(),3);
    openPlanEditor('Andere',null,tag,{type:'Andere',exercises:[{exId:ex.id,name:ex.name,sets:[{w:'',r:''}]}]});
    const sek=document.querySelector('[data-f=sek]'), dist=document.querySelector('[data-f=dist]');
    sek.value='600'; sek.dispatchEvent(new Event('input',{bubbles:true}));
    dist.value='2000'; dist.dispatchEvent(new Event('input',{bubbles:true}));
    const entwurf={ts:state.active.exercises[0].sets[0].ts||null,rest:restEnd};
    savePlanDraft(); const plan=planAmTag(tag);
    startWorkout('Andere',null,plan,tag,null);
    return {
      entwurf,gespeichert:{sek:+plan.exercises[0].sets[0].sek,dist:+plan.exercises[0].sets[0].dist},
      aktiv:{sek:state.active.exercises[0].sets[0].sek||'',dist:state.active.exercises[0].sets[0].dist||'',
        sekZiel:document.querySelector('[data-f=sek]').getAttribute('placeholder'),
        distZiel:document.querySelector('[data-f=dist]').getAttribute('placeholder'),logged:totalActiveSets()},
      workouts:state.workouts.length
    };
  })()`);
  p.gleich('geplante Kardiozeit erzeugt keinen Satz-Zeitstempel',kardio.entwurf.ts,null);
  p.gleich('geplante Kardiozeit startet keine Pause',kardio.entwurf.rest,null);
  p.gleich('Kardiozeit wird im Plan gespeichert',kardio.gespeichert.sek,600);
  p.gleich('Kardiostrecke wird im Plan gespeichert',kardio.gespeichert.dist,2000);
  p.gleich('Kardiozeit ist beim Start noch nicht absolviert',kardio.aktiv.sek,'');
  p.gleich('Kardiostrecke ist beim Start noch nicht absolviert',kardio.aktiv.dist,'');
  p.gleich('geplante Zeit bleibt als sichtbares Ziel erhalten',kardio.aktiv.sekZiel,'600');
  p.gleich('geplante Strecke bleibt als sichtbares Ziel erhalten',kardio.aktiv.distZiel,'2000');
  p.gleich('auch ein Kardioziel zählt nicht als geloggter Satz',kardio.aktiv.logged,0);
  p.gleich('Kardioplanung erzeugt kein Workout',kardio.workouts,0);
};
