/* V93: Die A/B-Statistik ergänzt die vorhandene Historie. Alte Push/Pull-
   Workouts müssen in Übersicht, Zyklusfenstern, Gesamt und Übungsanalyse
   weiter vollständig ausgewertet werden. */

const { js } = require('../lib/browser');

exports.name = 'V93 historische Statistiken bleiben erhalten';

exports.lauf = async ({ page, p }) => {
  const alt = await js(page, `(() => {
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)')
      || EXDB.find(e=>!istZeitArt(exArt(e.id))&&!exIsBW(e.id)&&!exIsAssist(e.id));
    const start=tagPlus(heuteIso(),-36);
    const w=(id,off,type,i)=>({id,date:workoutDatumFuerTag(tagPlus(start,off)),type,
      start:Date.parse(workoutDatumFuerTag(tagPlus(start,off))),
      end:Date.parse(workoutDatumFuerTag(tagPlus(start,off)))+60*60000,durFix:60*60000,rpe:6+(i%3),
      prs:i===4?[{kind:'Gewicht',name:ex.name,val:'80 kg',old:'77,5 kg'}]:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:70+i,r:8},{w:70+i,r:8}]}]});
    state.workouts=[];
    for(let i=0;i<5;i++){
      state.workouts.push(w('alt-push-'+i,i*6,'Push',i));
      state.workouts.push(w('alt-pull-'+i,i*6+1,'Pull',i));
    }
    state.bodyweight=[]; state.active=null; saveState();

    statsPanel='overview'; renderStats();
    const overview=document.querySelector('#stats-overview').textContent;
    statsPanel='week'; renderStats();
    const zyklus=document.querySelector('#stats-week').textContent;
    statsPanel='month'; renderStats();
    const fuenf=document.querySelector('#stats-month').textContent;
    statsPanel='all'; renderStats();
    const gesamt=document.querySelector('#stats-all').textContent;
    const mehr=renderAllStatsMehr();
    return {legacy:legacyClosedCycles().length,neu:closedCycles().length,
      unveraendert:state.workouts.every(w=>!('variant' in w)),overview,zyklus,fuenf,gesamt,mehr};
  })()`);

  p.gleich('fünf alte Push/Pull-Zyklen bleiben auswertbar', alt.legacy, 5);
  p.gleich('alte Zyklen werden nicht als neue A/B-Zyklen umgedeutet', alt.neu, 0);
  p.pruefe('historische Workouts bleiben strukturell unverändert', alt.unveraendert);
  ['Workouts','Volumen','Sätze','PRs','Leistungstrend','Trainingsrhythmus',
    'Kraftentwicklung','Nächste Ziele','Belastungstrend','Körpergewicht'].forEach(name=>
      p.enthaelt(`Übersicht enthält weiterhin ${name}`,alt.overview,name));
  p.enthaelt('letzter alter Zyklus bleibt einzeln aufrufbar',alt.zyklus,'Historischer Zyklus');
  p.enthaelt('alter Zyklus behält seine klassischen Kennzahlen',alt.zyklus,'Workouts');
  p.enthaelt('alter Zyklus behält sein Einheitsdiagramm',alt.zyklus,'Volumen je Einheit');
  ['Push/Pull-Balance','Volumen je historischem Zyklus','Sätze je historischem Zyklus',
    'Volumen je Satz','Entwicklung je Muskelgruppe','Trainingsdauer'].forEach(name=>
      p.enthaelt(`5-Zyklen-Reiter enthält weiterhin ${name}`,alt.fuenf,name));
  p.enthaelt('Gesamt zeigt die historische Zyklus-Volumenreihe',alt.gesamt,'Historisches Volumen je Push/Pull-Zyklus');
  p.enthaelt('Gesamt behält die Muskelverteilung',alt.gesamt,'Verteilung über alle Muskelgruppen');
  p.enthaelt('Gesamt behält die relative Kraft',alt.gesamt,'Relative Kraft');
  ['Volumen pro Monat','Deine Bestleistungen','Trainingsdauer','Wochentage'].forEach(name=>
    p.enthaelt(`weitere Gesamtauswertungen enthalten weiterhin ${name}`,alt.mehr,name));

  const zusammen = await js(page, `(() => {
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)')
      || EXDB.find(e=>!istZeitArt(exArt(e.id))&&!exIsBW(e.id)&&!exIsAssist(e.id));
    state.workouts.push({id:'neu-pa',date:workoutDatumFuerTag(tagPlus(heuteIso(),-1)),type:'Push',variant:'A',prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:82.5,r:8}]}]});
    saveState();
    statsPanel='all'; renderStats();
    return {alt:legacyClosedCycles().length,neu:runningCycle()&&runningCycle().einheitenErledigt,
      gesamt:document.querySelector('#stats-all').textContent};
  })()`);
  p.gleich('alte Zyklen bleiben nach dem Start von Push A erhalten',zusammen.alt,5);
  p.gleich('neuer A/B-Zyklus startet unabhängig mit einer Einheit',zusammen.neu,1);
  p.enthaelt('historische Volumenreihe bleibt neben dem neuen System sichtbar',zusammen.gesamt,'Historisches Volumen je Push/Pull-Zyklus');
};
