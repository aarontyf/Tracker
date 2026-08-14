#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Testläufer.

     node run.js              — alle Suiten
     node run.js a11y daten   — nur die genannten
     node run.js --leise      — nur Fehler ausgeben

   Jede Suite bekommt einen eigenen Browser mit frischem Profil. Das ist
   ein paar Sekunden langsamer als ein geteilter, dafür kann eine Suite die
   nächste nicht über localStorage oder offene Modale beeinflussen.
   ══════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { appOeffnen, overlaysSchliessen } = require('./lib/browser');
const { pruefer } = require('./lib/pruef');

const ORDNER = path.join(__dirname, 'suiten');
const args = process.argv.slice(2);
const leise = args.includes('--leise');
const filter = args.filter(a => !a.startsWith('--'));

const GRUEN = s => `\x1b[32m${s}\x1b[0m`;
const ROT   = s => `\x1b[31m${s}\x1b[0m`;
const GRAU  = s => `\x1b[90m${s}\x1b[0m`;
const FETT  = s => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const dateien = fs.readdirSync(ORDNER)
    .filter(f => f.endsWith('.js'))
    .filter(f => !filter.length || filter.some(x => f.includes(x)))
    .sort();

  if (!dateien.length) {
    console.error(ROT('Keine Suite gefunden' + (filter.length ? ` für: ${filter.join(', ')}` : '')));
    process.exit(2);
  }

  const berichte = [];
  const t0 = Date.now();

  for (const datei of dateien) {
    const suite = require(path.join(ORDNER, datei));
    const name = suite.name || datei.replace(/\.js$/, '');
    const p = pruefer(name);

    let app = null;
    try {
      app = await appOeffnen(suite.optionen || {});
      await overlaysSchliessen(app.page);
      await suite.lauf({ ...app, p });

      /* Ein unbemerkter JS-Fehler auf der Seite ist genauso ein Fehler wie
         eine fehlgeschlagene Zusicherung — sonst laufen Suiten grün, während
         die App im Hintergrund Ausnahmen wirft. */
      p.gleich('keine JS-Fehler auf der Seite', app.fehler.length, 0);
      if (app.fehler.length) app.fehler.slice(0, 5).forEach(f => p.pruefe('  ' + f.split('\n')[0], false));
    } catch (e) {
      p.pruefe('Suite lief durch', false, (e && e.message) || String(e));
      if (e && e.stack && !leise) console.error(GRAU(e.stack));
    } finally {
      if (app) await app.close().catch(() => {});
    }

    const bericht = p.ergebnis();
    berichte.push(bericht);

    const kopf = bericht.nok ? ROT(`✗ ${name}`) : GRUEN(`✓ ${name}`);
    console.log(`\n${FETT(kopf)}  ${GRAU(`${bericht.ok} ok, ${bericht.nok} fehlerhaft`)}`);
    for (const t of bericht.treffer) {
      if (t.ok && leise) continue;
      const mark = t.ok ? GRUEN('  ✓') : ROT('  ✗');
      console.log(`${mark} ${t.name}${t.info ? GRAU('  — ' + t.info) : ''}`);
    }
  }

  const ok  = berichte.reduce((a, b) => a + b.ok, 0);
  const nok = berichte.reduce((a, b) => a + b.nok, 0);
  const sek = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n' + '─'.repeat(60));
  console.log(FETT(nok ? ROT(`${nok} fehlerhaft`) + `, ${ok} ok` : GRUEN(`alle ${ok} Prüfungen ok`)) + GRAU(`  (${sek}s)`));

  process.exit(nok ? 1 : 0);
}

main().catch(e => { console.error(ROT('Läufer abgestürzt:'), e); process.exit(2); });
