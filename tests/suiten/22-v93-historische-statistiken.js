/* V94: Je zwei alte Push/Pull/Rest-Durchgänge werden ausschließlich in der
   Statistik zu Push A/Pull A/Push B/Pull B und damit zu einem 6-Tage-Zyklus.
   Die gespeicherten historischen Workouts dürfen sich dabei nicht ändern. */

const { js } = require('../lib/browser');

exports.name = 'V94 alte Statistiken als 6-Tage-Zyklen';

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
    state.workouts=[
      w('alt-push-1',0,'Push',0),w('alt-pull-1',1,'Pull',1),
      w('alt-push-2',3,'Push',2),w('alt-pull-2',4,'Pull',3),
      w('alt-push-3',6,'Push',4),w('alt-pull-3',7,'Pull',5),
      w('alt-push-4',9,'Push',6),w('alt-pull-4',10,'Pull',7)
    ];
    state.bodyweight=[]; state.active=null; saveState();
    const umgerechnet=legacyCycles().filter(c=>!c.vorlauf);
    const statistisch=statsClosedCycles();
    statsPanel='overview'; renderStats(); const overview=document.querySelector('#stats-overview').textContent;
    statsPanel='week'; renderStats(); const zyklus=document.querySelector('#stats-week').textContent;
    statsPanel='month'; renderStats(); const fuenf=document.querySelector('#stats-month').textContent;
    statsPanel='all'; renderStats(); const gesamt=document.querySelector('#stats-all').textContent;
    const mehr=renderAllStatsMehr();
    return {anzahl:umgerechnet.length,stats:statistisch.length,
      tage:umgerechnet.map(c=>c.tage),erledigt:umgerechnet.map(c=>c.einheitenErledigt),
      labels:umgerechnet[0].einheiten.map(x=>x.label),
      unveraendert:state.workouts.every(w=>!('variant' in w)),overview,zyklus,fuenf,gesamt,mehr};
  })()`);

  p.gleich('vier alte Durchgänge ergeben zwei Zyklen',alt.anzahl,2);
  p.gleich('beide umgerechneten Zyklen sind statistisch abgeschlossen',alt.stats,2);
  p.pruefe('jeder alte Statistikzyklus hat genau sechs Tage',alt.tage.every(x=>x===6));
  p.pruefe('jeder alte Statistikzyklus enthält vier Einheiten',alt.erledigt.every(x=>x===4));
  p.gleich('alte Einheiten erhalten die feste A/B-Reihenfolge',alt.labels.join(','),'Push A,Pull A,Push B,Pull B');
  p.pruefe('historische Rohdaten bleiben strukturell unverändert',alt.unveraendert);
  ['Workouts','Volumen','Sätze','PRs','Leistungstrend','Zyklustreue',
    'Kraftentwicklung','Nächste Ziele','Belastungstrend','Körpergewicht'].forEach(name=>
      p.enthaelt(`Übersicht enthält weiterhin ${name}`,alt.overview,name));
  p.enthaelt('Übersicht erklärt die 6-Tage-Umrechnung',alt.overview,'Alte Zyklen auf 6 Tage umgerechnet');
  p.enthaelt('letzter alter Zyklus läuft als normaler Zyklus',alt.zyklus,'Zyklus 2');
  p.enthaelt('alter Zyklus zeigt sechs Tage',alt.zyklus,'6 Tage');
  p.enthaelt('alter Zyklus zeigt alle vier A/B-Einheiten',alt.zyklus,'Push B');
  ['Push/Pull-Balance','Volumen je Zyklus','Sätze je Zyklus','Volumen je Satz',
    'Entwicklung je Muskelgruppe','Trainingsdauer'].forEach(name=>
      p.enthaelt(`5-Zyklen-Reiter enthält weiterhin ${name}`,alt.fuenf,name));
  p.enthaelt('Gesamt zeigt eine gemeinsame Zyklus-Volumenreihe',alt.gesamt,'Volumen je Zyklus');
  p.pruefe('Gesamt trennt die alten Zyklen nicht mehr ab',!alt.gesamt.includes('Historisches Volumen je Push/Pull-Zyklus'));
  p.enthaelt('Gesamt behält die Muskelverteilung',alt.gesamt,'Verteilung über alle Muskelgruppen');
  p.enthaelt('Gesamt behält die relative Kraft',alt.gesamt,'Relative Kraft');
  ['Volumen pro Monat','Deine Bestleistungen','Trainingsdauer','Wochentage'].forEach(name=>
    p.enthaelt(`weitere Gesamtauswertungen enthalten weiterhin ${name}`,alt.mehr,name));

  const zusammen = await js(page, `(() => {
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)')
      || EXDB.find(e=>!istZeitArt(exArt(e.id))&&!exIsBW(e.id)&&!exIsAssist(e.id));
    const w=(id,off,type,variant)=>({id,date:workoutDatumFuerTag(tagPlus(heuteIso(),off)),type,variant,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:82.5,r:8}]}]});
    state.workouts.push(
      w('neu-pa-1',-18,'Push','A'),w('neu-la-1',-17,'Pull','A'),
      w('neu-pb-1',-15,'Push','B'),w('neu-lb-1',-14,'Pull','B'),
      w('neu-pa-2',-12,'Push','A'));
    saveState();
    const cs=statsCycles();
    return {alle:cs.length,geschlossen:statsClosedCycles().length,
      nummern:cs.map(c=>c.n),lauf:statsRunningCycle()&&statsRunningCycle().einheitenErledigt,
      altUnveraendert:state.workouts.filter(w=>w.id.startsWith('alt-')).every(w=>!('variant' in w))};
  })()`);
  p.gleich('alte und neue Zyklen bilden eine gemeinsame Reihe',zusammen.alle,4);
  p.gleich('zwei alte und ein neuer Zyklus sind abgeschlossen',zusammen.geschlossen,3);
  p.gleich('gemeinsame Reihe wird durchgehend nummeriert',zusammen.nummern.join(','),'1,2,3,4');
  p.gleich('der laufende neue Zyklus zeigt genau seinen Stand',zusammen.lauf,1);
  p.pruefe('auch nach neuen Einträgen bleiben alte Rohdaten unverändert',zusammen.altUnveraendert);
};
