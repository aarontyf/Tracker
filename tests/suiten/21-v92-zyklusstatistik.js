/* V92/V94: Die Live-Rotation zählt explizite A/B-Daten. Die Statistik darf
   ältere Daten zusätzlich rückwirkend in denselben 6-Tage-Rhythmus setzen. */

const { js } = require('../lib/browser');

exports.name = 'V92 Einheiten pro Zyklus';

exports.lauf = async ({ page, p }) => {
  const migration = await js(page, `(() => {
    const s=normalisiereSettings({goal:2,setGoalLo:10,setGoalHi:20,rest:120});
    return {goal:s.goal,lo:s.cycleGoalLo,hi:s.cycleGoalHi,rest:s.rest,
      altesFeld:!!document.querySelector('#set-goal'),
      text:document.querySelector('#modal-settings').textContent};
  })()`);
  p.gleich('Ziel ist unveränderlich vier Einheiten pro Zyklus', migration.goal, 4);
  p.gleich('altes Wochenminimum wird einmalig in den Zyklus migriert', migration.lo, 9);
  p.gleich('altes Wochenmaximum wird einmalig in den Zyklus migriert', migration.hi, 17);
  p.gleich('andere Einstellungen bleiben bei der Migration erhalten', migration.rest, 120);
  p.gleich('altes editierbares Workoutziel ist entfernt', migration.altesFeld, false);
  p.enthaelt('Einstellungen benennen den 6-Tage-Zyklus', migration.text, '4 Einheiten pro Zyklus · 6 Tage');

  const vorlagen = await js(page, `(() => {
    const p={split:'ppl',tage:3,ort:'studio',erfahrung:'fortge',ziel:'aufbau'};
    const plan=buildSplit(p);
    state.templates=[]; splitUebernehmen(plan);
    return state.templates.map(t=>({label:einheitLabel(t),variant:t.variant}));
  })()`);
  p.gleich('Onboarding erzeugt immer die vier Vorlagen des neuen Systems',
    vorlagen.map(x=>x.label).join(','), 'Push A,Pull A,Push B,Pull B');
  p.pruefe('Onboarding speichert A/B strukturiert statt nur im Namen',
    vorlagen.every(x=>x.variant==='A'||x.variant==='B'));

  const legacy = await js(page, `(() => {
    const w=(id,off,type)=>({id,date:workoutDatumFuerTag(tagPlus(heuteIso(),off)),type,prs:[],exercises:[]});
    state.workouts=[w('alt-push',-4,'Push'),w('alt-pull',-2,'Pull')];
    saveState();
    statsPanel='overview'; renderStats();
    const overview=document.querySelector('#stats-overview').textContent;
    statsPanel='week'; renderStats();
    const zyklus=document.querySelector('#stats-week').textContent;
    const statsLauf=statsRunningCycle();
    return {hist:workoutsBisHeute().length,closed:closedCycles().length,passt:planPasstZuZyklen(),
      statsStand:statsLauf&&statsLauf.einheitenErledigt,overview,zyklus};
  })()`);
  p.gleich('Legacy-Workouts bleiben vollständig gespeichert', legacy.hist, 2);
  p.gleich('Legacy Push/Pull erzeugt keinen neuen A/B-Zyklus', legacy.closed, 0);
  p.gleich('Plan gilt erst ab explizitem Push A als neues System', legacy.passt, false);
  p.gleich('Statistik ordnet den ersten alten Durchgang rückwirkend A zu',legacy.statsStand,2);
  p.enthaelt('Übersicht erklärt die rückwirkende Umrechnung', legacy.overview, 'Alte Zyklen auf 6 Tage umgerechnet');
  p.enthaelt('Zyklus-Reiter zeigt den umgerechneten Einheitenstand', legacy.zyklus, '2/4');

  const zyklen = await js(page, `(() => {
    const ex=EXDB.find(e=>!istZeitArt(exArt(e.id)) && !exIsBW(e.id) && !exIsAssist(e.id));
    const start=tagPlus(heuteIso(),-18);
    const w=(id,off,type,variant)=>({id,date:workoutDatumFuerTag(tagPlus(start,off)),type,variant,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:50,r:8}]}]});
    state.settings=normalisiereSettings({cycleGoalLo:9,cycleGoalHi:17});
    state.workouts=[
      w('pa1',0,'Push','A'),w('la1',1,'Pull','A'),w('pb1',3,'Push','B'),w('lb1',4,'Pull','B'),
      w('pa2',6,'Push','A'),w('la2',7,'Pull','A'),w('pb2',9,'Push','B'),w('lb2',10,'Pull','B'),
      w('pa3',12,'Push','A')
    ];
    saveState();
    const cs=closedCycles(), lauf=runningCycle();
    statsPanel='overview'; renderStats(); const overview=document.querySelector('#stats-overview').textContent;
    statsPanel='month'; renderStats(); const span=document.querySelector('#stats-month').textContent;
    const t=groupTargetCycle(1,1);
    return {closed:cs.length,units:cs[0].einheitenErledigt,labels:cs[0].einheiten.map(x=>x.label),
      voll:cs[0].vollstaendig,tage:cs[0].tage,lauf:lauf&&lauf.einheitenErledigt,target:t,overview,span};
  })()`);
  p.gleich('zwei vollständige Zyklen werden abgeschlossen', zyklen.closed, 2);
  p.gleich('Vollständigkeit zählt vier verschiedene Einheiten', zyklen.units, 4);
  p.gleich('Einheiten stehen in der festgelegten A/B-Reihenfolge', zyklen.labels.join(','), 'Push A,Pull A,Push B,Pull B');
  p.pruefe('vollständiger Sechs-Tage-Zyklus wird wahr erkannt', zyklen.voll && zyklen.tage===6);
  p.gleich('laufender Folgezyklus zeigt genau seinen Stand', zyklen.lauf, 1);
  p.pruefe('Zielkorridor wird ohne Wochenumrechnung direkt gelesen', zyklen.target.lo===9 && zyklen.target.hi===17);
  p.enthaelt('Übersicht zeigt laufenden Stand als Einheitenbruch', zyklen.overview, '1/4');
  p.enthaelt('Mehrzyklus-KPI ist ein Durchschnitt pro Zyklus', zyklen.span, 'Ø Einheiten/Zyklus');
  p.enthaelt('Mehrzyklus-Statistik listet alle vier Einheiten', zyklen.span, 'Push B');
  p.pruefe('alte Monatskennzahl kommt nicht zurück', !zyklen.span.includes('Workouts/30 Tage'));

  const effizienz = await js(page, `(() => {
    const ex=EXDB.find(e=>(e.p||[]).includes('chest') && !istZeitArt(exArt(e.id)));
    const mach=(id,n)=>({id,date:workoutDatumFuerTag(heuteIso()),type:'Push',variant:'A',prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:Array.from({length:n},(_,i)=>({w:40+i,r:8}))}]});
    state.settings=normalisiereSettings({cycleGoalLo:9,cycleGoalHi:17});
    const zwei=[mach('a',8),mach('b',8)];
    const verteilt=groupBars(muscleSetsBy(zwei,statsSetMode),zwei,1);
    const einzeln=[mach('c',12)];
    const geballt=groupBars(muscleSetsBy(einzeln,statsSetMode),einzeln,1);
    const brust=html=>{const box=document.createElement('div');box.innerHTML=html;
      return box.querySelector('[data-grp="Brust"]')?.textContent||'';};
    return {verteilt:brust(verteilt),geballt:brust(geballt)};
  })()`);
  p.pruefe('16 Sätze über zwei Einheiten lösen keine Einheitenwarnung aus', !effizienz.verteilt.includes('!'));
  p.enthaelt('12 Sätze in einer Einheit lösen die Effizienzwarnung aus', effizienz.geballt, '!');
};
