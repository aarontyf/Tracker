#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Leistungsmessung.

     node bench.js                  — Standardlauf
     THROTTLE=1 node bench.js       — ungedrosselt (Desktop-Verhältnisse)
     WORKOUTS=300 node bench.js     — grössere Historie

   Gemessen wird der Median mehrerer Runden, nicht der Mittelwert: Ein
   einzelner GC-Lauf oder eine Scheduler-Pause verzieht den Mittelwert um
   Dutzende Prozent und lässt einen Fortschritt wie einen Rückschritt
   aussehen. Die CPU wird gedrosselt, weil die App auf einem Handy im
   Studio läuft und nicht auf einem Entwicklerrechner.
   ══════════════════════════════════════════════════════════════════════ */

const { appOeffnen, overlaysSchliessen, js } = require('./lib/browser');
const { seedCode } = require('./lib/seed');

const THROTTLE = Number(process.env.THROTTLE || 4);
const WORKOUTS = Number(process.env.WORKOUTS || 200);
const RUNDEN   = Number(process.env.RUNDEN || 9);

const MESSUNG = `(() => {
  const runden = ${RUNDEN};
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const erg = {};

  const messe = (name, fn, teiler = 1) => {
    for (let i = 0; i < 3; i++) fn();                       // warmlaufen
    const laeufe = [];
    for (let r = 0; r < runden; r++) {
      const t = performance.now();
      fn();
      laeufe.push((performance.now() - t) / teiler);
    }
    erg[name] = +median(laeufe).toFixed(3);
  };

  const begriffe = ['b','be','ben','bench','kn','kni','knie','r','ro','row','rud','c','cu','cur','curl',
                    's','sq','squ','squat','d','de','dead','press','pull','kabel','hantel','maschine'];

  const suchfeld = sel => {
    const el = document.querySelector(sel);
    let i = 0;
    return () => { el.value = begriffe[i++ % begriffe.length]; };
  };

  /* Einzelne Bausteine — zeigen, WO die Zeit hingeht. */
  {
    const ids = EXDB.slice(0, 100).map(e => e.id);
    messe('getEx x2000', () => { for (let k = 0; k < 20; k++) for (const id of ids) getEx(id); });
  }
  {
    let i = 0;
    messe('filterEx', () => filterEx(begriffe[i++ % begriffe.length], 'Alle'));
  }
  messe('globalAgg (warm)', () => globalAgg());
  messe('globalAgg (kalt)', () => { if (typeof invalidateAgg === 'function') invalidateAgg(); globalAgg(); });

  /* Ganze Bildschirme — das, was der Nutzer als Ruckeln merkt. */
  {
    const setz = suchfeld('#lib-search');
    messe('renderLib', () => { setz(); renderLib(); });
  }
  {
    const setz = suchfeld('#pick-search');
    messe('renderPickList', () => { setz(); renderPickList(); });
  }
  {
    const setz = suchfeld('#exstat-search');
    messe('renderExStats', () => { setz(); renderExStats(); });
  }
  messe('renderHome', () => renderHome());
  messe('renderTrain', () => renderTrain());
  messe('renderHist', () => renderHist());
  messe('renderStats', () => renderStats());
  messe('renderAll', () => renderAll());

  return erg;
})()`;

(async () => {
  const app = await appOeffnen({ throttle: THROTTLE });
  await overlaysSchliessen(app.page);

  const stat = await js(app.page, seedCode({ workouts: WORKOUTS }));
  await app.page.waitForTimeout(300);

  const erg = await js(app.page, MESSUNG);

  console.log(`\nHistorie: ${stat.workouts} Einheiten, ${stat.saetze} Sätze` +
              `   CPU-Drosselung: ${THROTTLE}x   Median aus ${RUNDEN} Runden\n`);

  const breite = Math.max(...Object.keys(erg).map(k => k.length));
  for (const [name, ms] of Object.entries(erg)) {
    const balken = '█'.repeat(Math.min(40, Math.round(ms)));
    console.log(`  ${name.padEnd(breite)}  ${String(ms).padStart(7)} ms  \x1b[90m${balken}\x1b[0m`);
  }

  if (app.fehler.length) {
    console.log('\n\x1b[31mJS-Fehler während der Messung:\x1b[0m');
    app.fehler.slice(0, 5).forEach(f => console.log('  ' + f.split('\n')[0]));
  }
  console.log('');

  await app.close();
  process.exit(app.fehler.length ? 1 : 0);
})().catch(e => { console.error('Messung abgestürzt:', e); process.exit(2); });
