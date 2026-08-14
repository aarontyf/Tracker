/* Start, leerer Zustand, Navigation — das Fundament.
   Wenn diese Suite rot ist, sind alle anderen Ergebnisse wertlos. */

const { js, klick, dawar, text, warte } = require('../lib/browser');
const { seedCode, leerCode } = require('../lib/seed');

const SCREENS = ['scr-home', 'scr-train', 'scr-hist', 'scr-lib', 'scr-stats'];

exports.name = 'Grundlagen';

exports.lauf = async ({ page, p }) => {
  /* ── Erststart: leeres Gerät ──────────────────────────────────────── */
  await js(page, leerCode);
  await warte(page, 200);

  p.gleich('leerer Zustand hat keine Workouts', await js(page, 'state.workouts.length'), 0);

  for (const s of SCREENS) {
    p.pruefe(`Bildschirm ${s} existiert`, await dawar(page, '#' + s));
  }

  /* Der Verlauf muss im Leerzustand etwas Sinnvolles sagen statt leer zu bleiben. */
  await js(page, `showScreen('scr-hist')`);
  await warte(page, 150);
  const leerHinweis = await text(page, '#hist-list');
  p.pruefe('Verlauf zeigt im Leerzustand einen Hinweis', leerHinweis.trim().length > 10, leerHinweis.trim().slice(0, 60));

  /* Die Bibliothek ist auch ohne Historie voll nutzbar — sie hängt an EXDB. */
  await js(page, `showScreen('scr-lib')`);
  await warte(page, 150);
  p.mind('Bibliothek listet auch ohne Historie', await js(page, `document.querySelectorAll('#lib-list [data-lib]').length`), 50);

  /* ── Mit Daten ────────────────────────────────────────────────────── */
  const stat = await js(page, seedCode({ workouts: 60 }));
  p.gleich('Testdaten angelegt', stat.workouts, 60);
  p.mind('Testdaten enthalten Sätze', stat.saetze, 1000);
  p.mind('Testdaten decken mehrere Übungen ab', stat.uebungen, 20);

  /* Jeder Bildschirm muss sich zeichnen lassen, ohne zu werfen. */
  for (const s of SCREENS) {
    await js(page, `showScreen(${JSON.stringify(s)})`);
    await warte(page, 120);
    const sichtbar = await js(page, `(() => {
      const el = document.querySelector('#${s}');
      return !!el && getComputedStyle(el).display !== 'none';
    })()`);
    p.pruefe(`${s} wird sichtbar`, sichtbar);
  }

  /* renderAll() ist der Sammelaufruf nach jeder Datenänderung — er darf
     unter keinen Umständen werfen, sonst bleibt die App auf halbem Weg stehen. */
  const renderOk = await js(page, `(() => { try { renderAll(); return true; } catch(e){ return String(e); } })()`);
  p.gleich('renderAll läuft fehlerfrei', renderOk, true);

  /* Die Startseite muss nach dem Seed echte Zahlen zeigen, keine Platzhalter. */
  await js(page, `showScreen('scr-home')`);
  await warte(page, 300);
  const home = await text(page, '#scr-home');
  p.pruefe('Startseite zeigt Inhalt', home.trim().length > 50, home.trim().length + ' Zeichen');
};
