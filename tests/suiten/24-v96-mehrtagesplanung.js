/* V96: Künftige Vorlagen werden als unabhängige Tagespläne gespeichert.
   Montag und Dienstag müssen gleichzeitig planbar bleiben; kein Klick darf
   den ersten Tag überschreiben oder den einzigen aktiven Workout-Slot belegen. */

const { js } = require('../lib/browser');

exports.name = 'V96 Mehrtagesplanung';

exports.lauf = async ({ page, p }) => {
  const geplant = await js(page, `(() => {
    closeModals();
    state.workouts=[]; state.plan={}; state.active=null;
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
    const nachErstem={
      aktiv:state.active,
      wahl:dsWahl,
      montag:planAmTag(montag)&&einheitLabel(planAmTag(montag)),
      montagEx:(planAmTag(montag)||{exercises:[]}).exercises.map(e=>e.exId)
    };
    const zweiter=document.querySelector('[data-plan-tpl="tpl-pull-a"]');
    if(zweiter) zweiter.click();
    const pMo=planAmTag(montag), pDi=planAmTag(dienstag);
    return {
      montag,dienstag,nachErstem,
      aktiv:state.active,wahl:dsWahl,erwarteteWahl:tagPlus(dienstag,1),
      labels:[einheitLabel(pMo),einheitLabel(pDi)],
      exIds:[pMo.exercises[0].exId,pDi.exercises[0].exId],
      planKeys:Object.keys(state.plan).sort(),
      workoutCount:state.workouts.length
    };
  })()`);

  p.gleich('Montag wird als eigener Push-A-Plan gespeichert',geplant.nachErstem.montag,'Push A');
  p.gleich('nach Montag ist Dienstag direkt ausgewählt',geplant.nachErstem.wahl,geplant.dienstag);
  p.gleich('Planen öffnet kein blockierendes aktives Workout',geplant.nachErstem.aktiv,null);
  p.gleich('Montag und Dienstag behalten verschiedene A/B-Einheiten',geplant.labels.join(' → '),'Push A → Pull A');
  p.pruefe('beide Tage behalten ihre eigenen Übungen',geplant.exIds[0]!==geplant.exIds[1],geplant.exIds);
  p.gleich('genau beide Kalendertage sind im Plan gespeichert',geplant.planKeys.join(','),[geplant.montag,geplant.dienstag].sort().join(','));
  p.gleich('nach Dienstag ist der nächste Tag bereit',geplant.wahl,geplant.erwarteteWahl);
  p.gleich('auch der zweite Plan belegt keinen aktiven Workout-Slot',geplant.aktiv,null);
  p.gleich('reine Planung erzeugt kein angeblich absolviertes Workout',geplant.workoutCount,0);

  const getrennt = await js(page, `(() => {
    const montag=tagPlus(heuteIso(),1), dienstag=tagPlus(montag,1);
    dsSpringe(montag);
    const kg=document.querySelector('[data-planw="0"]');
    kg.value='57,5'; kg.dispatchEvent(new Event('change',{bubbles:true}));
    dsSpringe(dienstag);
    const saetze=document.querySelector('[data-plansets="0"]');
    saetze.value='3'; saetze.dispatchEvent(new Event('change',{bubbles:true}));
    dsSpringe(montag);
    const next=document.querySelector('#plan-next');
    const nextText=next&&next.textContent.trim();
    const marken=[...document.querySelectorAll('#ds-days .dsday.geplant')]
      .map(x=>x.dataset.tag).sort();
    if(next) next.click();
    return {
      montagKg:+planAmTag(montag).exercises[0].sets[0].w,
      dienstagSaetze:planAmTag(dienstag).exercises[0].sets.length,
      nextText,wahl:dsWahl,dienstag,marken
    };
  })()`);

  p.gleich('Änderung am Dienstag überschreibt Montags Gewicht nicht',getrennt.montagKg,57.5);
  p.gleich('Dienstag behält seine eigene Satzzahl',getrennt.dienstagSaetze,3);
  p.enthaelt('Folgetag-Aktion erkennt einen vorhandenen Plan',getrennt.nextText,'öffnen');
  p.gleich('Folgetag-Aktion öffnet exakt Dienstag',getrennt.wahl,getrennt.dienstag);
  p.gleich('Tagesleiste markiert beide Pläne',getrennt.marken.join(','),[geplant.montag,geplant.dienstag].sort().join(','));
};
