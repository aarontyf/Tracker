/* V98 entfernt Erklärtext aus den Hauptwegen, ohne Funktionen oder Daten
   zu verstecken. Die Suite hält genau diese Grenze fest: weniger Oberfläche,
   dieselben Einstellungen und unveränderte Workout-Rohdaten. */

const { js } = require('../lib/browser');

exports.name = 'V98 Clean UI ohne Funktionsverlust';

exports.lauf = async ({ page, p }) => {
  const grundlage = await js(page, `(() => {
    const gruppen=[...document.querySelectorAll('#modal-settings .settings-group')];
    const text=document.body.textContent;
    const verboten=[
      'Woher kommen die Zahlen?',
      'Berechnung der neuen Kennzahlen',
      'Vorschlag auf Basis deines Arbeitsgewichts',
      'Rekorde zeigen, was war',
      'Ermüdung klingt über 2–5 Tage',
      'So sieht es der Rhythmus Push A'
    ];
    const ids=['set-rest','set-rir','sync-open','ai-open','btn-export','btn-import','btn-wipe'];
    return {
      version:text.includes('Fitness Tracker V99'),
      gruppen:gruppen.length,
      titel:gruppen.map(x=>(x.querySelector('summary span')||{}).textContent||''),
      geschlossen:gruppen.every(x=>!x.open),
      fehlen:ids.filter(id=>!document.getElementById(id)),
      alteTexte:verboten.filter(x=>text.includes(x)),
      langeSettingsTexte:[...document.querySelectorAll('#modal-settings p')]
        .map(x=>(x.textContent||'').trim()).filter(x=>x.length>120)
    };
  })()`);

  p.gleich('V99 ist in der Oberfläche gekennzeichnet', grundlage.version, true);
  p.gleich('Einstellungen sind in drei klare Bereiche gegliedert', grundlage.gruppen, 3);
  p.gleich('Bereiche heißen Training, Verbindungen und Backup & Daten',
    grundlage.titel.join(' · '), 'Training · Verbindungen · Backup & Daten');
  p.gleich('sekundäre Einstellungen sind beim Öffnen zunächst geschlossen', grundlage.geschlossen, true);
  p.gleich('alle sicherheits- und funktionsrelevanten Bedienelemente bleiben erhalten',
    grundlage.fehlen.length, 0);
  p.gleich('alte lange Erklärblöcke sind vollständig entfernt', grundlage.alteTexte.length, 0);
  p.gleich('Einstellungen enthalten keinen Absatz über 120 Zeichen',
    grundlage.langeSettingsTexte.length, 0);

  const einstellungen = await js(page, `(() => {
    document.querySelector('#btn-settings').click();
    const training=document.querySelector('#modal-settings .settings-group');
    training.open=true;
    const summary=training.querySelector('summary').getBoundingClientRect();
    const rest=document.querySelector('#set-rest').getBoundingClientRect();
    return {
      offen:training.open,
      dialog:document.querySelector('#modal-settings').classList.contains('on'),
      summaryH:Math.round(summary.height), restH:Math.round(rest.height),
      rhythmus:training.textContent.includes('Push A · Pull A · Rest · Push B · Pull B · Rest')
    };
  })()`);

  p.gleich('Einstellungsgruppe lässt sich öffnen', einstellungen.offen, true);
  p.gleich('Einstellungsdialog öffnet weiterhin korrekt', einstellungen.dialog, true);
  p.pruefe('Aufklapper bleibt ein großes Touch-Ziel', einstellungen.summaryH >= 44, einstellungen.summaryH);
  p.pruefe('Eingabefeld bleibt ein großes Touch-Ziel', einstellungen.restH >= 44, einstellungen.restH);
  p.gleich('der feste Sechs-Tage-Rhythmus bleibt sichtbar', einstellungen.rhythmus, true);

  const start = await js(page, `(() => {
    closeModals();
    const ex=EXDB.find(e=>e.art==='kraft'&&!exIsAssist(e.id)) || EXDB[0];
    const tag=heuteIso();
    state.workouts=[]; state.active=null;
    state.plan={};
    state.plan[tag]={id:'v98-plan',date:workoutDatumFuerTag(tag),type:'Push',variant:'A',
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:50,r:8},{w:50,r:8}]}]};
    saveState(); _vorCache=null; _vorKey=''; renderHome();
    const box=document.querySelector('#home-suggest');
    const buttons=[...box.querySelectorAll('button')].map(x=>x.textContent.trim());
    return {
      vorhanden:!!box.querySelector('.card'),
      buttons,
      erklaerer:box.querySelectorAll('details,.erkl').length,
      langeAbsaetze:[...box.querySelectorAll('p')].filter(x=>x.textContent.trim().length>100).length,
      text:box.textContent.trim()
    };
  })()`);

  p.gleich('geplantes Training bleibt als kompakte Startkarte sichtbar', start.vorhanden, true);
  p.gleich('Startkarte bietet nur die zwei eindeutigen Aktionen', start.buttons.join(' · '), 'Start · Ändern');
  p.gleich('Startkarte enthält keine Erklär-Aufklapper', start.erklaerer, 0);
  p.gleich('Startkarte enthält keine langen Absätze', start.langeAbsaetze, 0);
  p.enthaelt('Startkarte kennzeichnet den Plan', start.text, 'Heute · geplant');

  const statistik = await js(page, `(() => {
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)')
      || EXDB.find(e=>e.art==='kraft'&&!exIsBW(e.id)&&!exIsAssist(e.id));
    const start=tagPlus(heuteIso(),-18);
    const w=(id,off,type,variant,kg)=>({id,date:workoutDatumFuerTag(tagPlus(start,off)),type,variant,
      start:Date.parse(workoutDatumFuerTag(tagPlus(start,off))),
      end:Date.parse(workoutDatumFuerTag(tagPlus(start,off)))+55*60000,durFix:55*60000,rpe:7,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:kg,r:8},{w:kg,r:8}]}]});
    state.plan={}; state.active=null;
    state.workouts=[
      w('v98-1a',0,'Push','A',50),w('v98-1b',1,'Pull','A',50),
      w('v98-1c',3,'Push','B',52),w('v98-1d',4,'Pull','B',52),
      w('v98-2a',6,'Push','A',52),w('v98-2b',7,'Pull','A',52),
      w('v98-2c',9,'Push','B',54),w('v98-2d',10,'Pull','B',54),
      w('v98-3a',12,'Push','A',56)
    ];
    saveState();
    const roh=JSON.stringify(state.workouts);
    statsPanel='overview'; renderStats();
    const el=document.querySelector('#stats-overview');
    const sichtbar=x=>{
      const r=x.getBoundingClientRect(),s=getComputedStyle(x);
      return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
    };
    const karte=el.querySelector('.card');
    return {
      unveraendert:roh===JSON.stringify(state.workouts),
      methoden:el.querySelectorAll('.metric-method').length,
      erklaerer:el.querySelectorAll('details.erkl').length,
      langeSichtbareAbsaetze:[...el.querySelectorAll('p')]
        .filter(sichtbar).map(x=>x.textContent.trim()).filter(x=>x.length>160),
      padding:karte?parseFloat(getComputedStyle(karte).paddingLeft):999,
      viewport:innerWidth, html:document.documentElement.scrollWidth, body:document.body.scrollWidth
    };
  })()`);

  p.gleich('Statistik-Rendering verändert keine Workout-Rohdaten', statistik.unveraendert, true);
  p.gleich('Berechnungsprosa ist aus der Statistikoberfläche entfernt', statistik.methoden, 0);
  p.gleich('Statistikübersicht enthält keine alten Erklär-Aufklapper', statistik.erklaerer, 0);
  p.gleich('sichtbare Statistikabsätze bleiben unter 160 Zeichen',
    statistik.langeSichtbareAbsaetze.length, 0);
  p.hoechstens('mobile Karten haben höchstens 12 px Innenabstand', statistik.padding, 12);
  p.pruefe('Clean-UI erzeugt keinen horizontalen Scrollbereich',
    statistik.html<=statistik.viewport && statistik.body<=statistik.viewport,
    JSON.stringify({viewport:statistik.viewport,html:statistik.html,body:statistik.body}));
};
