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

   ── WIE WEIT MAN DIESEN ZAHLEN TRAUEN DARF ───────────────────────────
   Den Bausteinen oben (getEx, filterEx, globalAgg) sehr weit: Sie sind
   klein, rein rechnend und schwanken kaum.

   Den ganzen Bildschirmen deutlich weniger. Sie zeichnen ins DOM, stossen
   Animationen an und hinterlassen einen Zustand, in dem die nächste Messung
   läuft. Gemessen wurde hier einmal renderTrain mit 184 ms, das in
   Einzelmessung reproduzierbar 19 ms braucht — ein Faktor 10, allein aus
   der Reihenfolge. Wer eine solche Zahl sieht, misst sie einzeln nach,
   bevor er sie glaubt:

     node -e "…" oder eine eigene kleine Datei, die NUR diesen einen
     Renderer misst, in einer frischen Seite.

   Und für den Vergleich zweier Stände immer --gegen benutzen, nie zwei
   getrennte Aufrufe: Absolute Zahlen schwankten zwischen zwei Läufen um
   mehr als das Anderthalbfache.
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

  /* ── Zählwerk stilllegen ───────────────────────────────────────────
     runCounters() startet für jede Kennzahl eine Animation über
     requestAnimationFrame. Im Echtbetrieb läuft die einmal und ist nach
     einer halben Sekunde vorbei. In einer Messschleife startet sie bei
     JEDEM Durchlauf erneut, ohne dass die vorige fertig wäre — nach zwölf
     Runden laufen Dutzende Animationen gleichzeitig und bremsen genau die
     Funktion aus, die gerade gemessen wird.

     Wie stark: renderHist wurde damit mit 219 ms gemessen, ohne mit 35 ms.
     Der Sechsfache. Und weil die Zahl davon abhängt, wie viele Renderungen
     vorher liefen, schwankte sie zwischen zwei Läufen um denselben Faktor —
     eine Verbesserung sah dann aus wie eine Verschlechterung.

     Gemessen wird deshalb die Arbeit, nicht die Animation. Dass die
     Animation existiert, ist kein Fehler; sie hier mitzumessen schon. */
  const _rc = window.runCounters;
  if (typeof _rc === 'function') window.runCounters = () => {};

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

  if (typeof _rc === 'function') window.runCounters = _rc;
  return erg;
})()`;

async function miss(datei) {
  const app = await appOeffnen({ throttle: THROTTLE, datei });
  await overlaysSchliessen(app.page);
  const stat = await js(app.page, seedCode({ workouts: WORKOUTS }));
  /* Die Sicherungs-Warnung legt sich sonst über die Seite und verzerrt das
     Zeichnen der Bildschirme dahinter. */
  await js(app.page, 'state.settings.lastBackup = Date.now(); saveState(); closeModals();');
  await app.page.waitForTimeout(300);
  const erg = await js(app.page, MESSUNG);
  const fehler = app.fehler.slice();
  await app.close();
  return { stat, erg, fehler };
}

(async () => {
  /* ── Vergleichsbetrieb ──────────────────────────────────────────────
     Absolute Zahlen aus GETRENNTEN Läufen sind wertlos: Sie schwankten hier
     zwischen zwei Aufrufen um mehr als das Anderthalbfache, weil jeder Lauf
     einen eigenen Browser, eine eigene Speicherbelegung und eine eigene
     Laune des Schedulers hat. Wer eine Änderung bewerten will, muss beide
     Stände im selben Prozess nacheinander messen:

       node bench.js --gegen ../alt/index.html

     Der Wert unter „Delta" ist dann belastbar, die absoluten Millisekunden
     bleiben es auch dort nur als Grössenordnung. */
  const gegenIdx = process.argv.indexOf('--gegen');
  const gegen = gegenIdx >= 0 ? require('path').resolve(process.argv[gegenIdx + 1]) : null;

  const jetzt = await miss(null);
  const alt = gegen ? await miss(gegen) : null;

  console.log(`\nHistorie: ${jetzt.stat.workouts} Einheiten, ${jetzt.stat.saetze} Sätze` +
              `   CPU-Drosselung: ${THROTTLE}x   Median aus ${RUNDEN} Runden`);
  if (gegen) console.log(`Vergleich gegen: ${gegen}`);
  console.log('');

  const breite = Math.max(...Object.keys(jetzt.erg).map(k => k.length));
  for (const [name, ms] of Object.entries(jetzt.erg)) {
    let zeile = `  ${name.padEnd(breite)}  ${String(ms).padStart(7)} ms`;
    if (alt && alt.erg[name] != null) {
      const vor = alt.erg[name];
      const d = vor === 0 ? 0 : ((ms - vor) / vor) * 100;
      const pfeil = d < -5 ? '\x1b[32m▼' : d > 5 ? '\x1b[31m▲' : '\x1b[90m·';
      zeile += `   ${String(vor).padStart(7)} vorher   ${pfeil} ${d >= 0 ? '+' : ''}${d.toFixed(0)}%\x1b[0m`;
    } else {
      zeile += `  \x1b[90m${'█'.repeat(Math.min(40, Math.round(ms)))}\x1b[0m`;
    }
    console.log(zeile);
  }

  if (jetzt.fehler.length) {
    console.log('\n\x1b[31mJS-Fehler während der Messung:\x1b[0m');
    jetzt.fehler.slice(0, 5).forEach(f => console.log('  ' + f.split('\n')[0]));
  }
  console.log('');
  process.exit(jetzt.fehler.length ? 1 : 0);
})().catch(e => { console.error('Messung abgestürzt:', e); process.exit(2); });
