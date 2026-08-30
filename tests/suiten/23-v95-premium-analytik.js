/* V95: Neue Analysen bleiben zyklusrein, verändern keine Rohdaten und
   schließen den laufenden Zyklus aus Vergleich und Durchschnitt aus. */

const { js } = require('../lib/browser');

exports.name = 'V95 Premium-Design und neue Analytik';

exports.lauf = async ({ page, p }) => {
  const analyse = await js(page, `(() => {
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)')
      || EXDB.find(e=>!istZeitArt(exArt(e.id))&&!exIsBW(e.id)&&!exIsAssist(e.id));
    const start=tagPlus(heuteIso(),-24);
    const w=(id,off,type,variant,gewicht,prs=[])=>({id,
      date:workoutDatumFuerTag(tagPlus(start,off)),type,variant,prs,
      start:Date.parse(workoutDatumFuerTag(tagPlus(start,off))),
      end:Date.parse(workoutDatumFuerTag(tagPlus(start,off)))+60*60000,
      durFix:60*60000,rpe:7,
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:gewicht,r:8},{w:gewicht,r:8}]}]});
    state.workouts=[
      w('c1-pa',0,'Push','A',50),w('c1-la',1,'Pull','A',52),
      w('c1-pb',3,'Push','B',54),w('c1-lb',4,'Pull','B',56),
      w('c2-pa',6,'Push','A',52),w('c2-la',7,'Pull','A',54),
      w('c2-pb',9,'Push','B',58,[{kind:'Gewicht',name:ex.name,val:'58 kg',old:'56 kg'}]),
      /* Start von Zyklus 3 schließt Zyklus 2, obwohl Pull B fehlt. */
      w('c3-pa',12,'Push','A',999)
    ];
    state.bodyweight=[]; state.active=null; saveState();
    const roh=JSON.stringify(state.workouts);
    const cs=statsClosedCycles(), a=premiumAnalytics(cs);
    const m=Object.fromEntries(a.metrics.map(x=>[x.id,x]));
    statsPanel='overview';renderStats();
    const overview=document.querySelector('#stats-overview');
    statsPanel='month';renderStats();
    const month=document.querySelector('#stats-month');
    return {
      closed:cs.length,running:statsRunningCycle()&&statsRunningCycle().einheitenErledigt,
      metricCount:a.metrics.length,unique:new Set(a.metrics.map(x=>x.id)).size,
      groups:a.metrics.reduce((o,x)=>(o[x.group]=(o[x.group]||0)+1,o),{}),
      missed:m.missed_unit.value,missedMeta:m.missed_unit.meta,
      abVolume:m.ab_volume.value,steigerung:m.improvement_rate.value,prDichte:m.pr_density.value,
      runningExcluded:!a.workouts.some(x=>x.id==='c3-pa'),
      unchanged:roh===JSON.stringify(state.workouts),
      preview:overview.querySelectorAll('[data-stat-id]').length,
      bento:overview.querySelectorAll('.stats-bento').length,
      collapsed:overview.querySelectorAll('.compact-details').length,
      allMetrics:month.querySelectorAll('[data-stat-id]').length,
      text:month.textContent
    };
  })()`);

  p.gleich('nur zwei abgeschlossene Zyklen fließen ein', analyse.closed, 2);
  p.gleich('der dritte Zyklus bleibt laufend', analyse.running, 1);
  p.gleich('V95 liefert vierzehn neue Kennzahlen', analyse.metricCount, 14);
  p.gleich('jede neue Kennzahl besitzt eine eindeutige ID', analyse.unique, 14);
  p.pruefe('Kennzahlen sind in Rotation, Fortschritt und Struktur gegliedert',
    analyse.groups.rotation===6 && analyse.groups.progress===4 && analyse.groups.structure===4);
  p.gleich('häufigste ausgelassene Einheit wird korrekt erkannt', analyse.missed, 'Pull B');
  p.enthaelt('Auslassungsquote nennt den richtigen Zeitraum', analyse.missedMeta, '1 von 2 Zyklen');
  p.pruefe('laufender Zyklus verfälscht keine neue Statistik', analyse.runningExcluded);
  p.gleich('laufende 999 kg verfälschen die A/B-Verteilung nicht', analyse.abVolume, '55 / 45 %');
  p.gleich('Steigerungsquote nutzt nur abgeschlossene Folgesessions', analyse.steigerung, '83 %');
  p.gleich('PR-Dichte nutzt nur abgeschlossene Workouts', analyse.prDichte, '1,4');
  p.pruefe('Analytik verändert keine gespeicherten Workouts', analyse.unchanged);
  p.gleich('Übersicht zeigt nur vier kompakte Analysewerte', analyse.preview, 4);
  p.pruefe('Übersicht nutzt eine gewichtete Bento-Hierarchie', analyse.bento>=2);
  p.pruefe('sekundäre Bereiche sind kompakt aufklappbar', analyse.collapsed>=2);
  p.gleich('5-Zyklen-Ansicht zeigt alle vierzehn Kennzahlen', analyse.allMetrics, 14);
  ['A/B · Volumen','A/B · Sätze','Push B vs. A','Pull B vs. A','Steigerungsquote',
    'Median-Fortschritt','PR-Dichte','Übungsstabilität','Muskelabdeckung','Volumen-Schwankung']
    .forEach(name=>p.enthaelt(`neue Kennzahl sichtbar: ${name}`,analyse.text,name));

  await page.setViewportSize({width:390,height:844});
  const mobil = await js(page, `(() => ({
    viewport:innerWidth,html:document.documentElement.scrollWidth,
    body:document.body.scrollWidth,
    kleineTouchziele:[...document.querySelectorAll('button:not([hidden]),summary')]
      .filter(x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return s.display!=='none'&&r.width>0&&r.height>0&&(r.width<43||r.height<43);})
      .slice(0,5).map(x=>({text:(x.textContent||x.getAttribute('aria-label')||'').trim(),w:Math.round(x.getBoundingClientRect().width),h:Math.round(x.getBoundingClientRect().height)}))
  }))()`);
  p.pruefe('390-px-Ansicht erzeugt keinen horizontalen Scrollbereich',
    mobil.html<=mobil.viewport && mobil.body<=mobil.viewport);
  p.pruefe('sichtbare Buttons und Aufklapper sind mindestens 44 × 44 px groß',
    mobil.kleineTouchziele.length===0,JSON.stringify(mobil.kleineTouchziele));
};
