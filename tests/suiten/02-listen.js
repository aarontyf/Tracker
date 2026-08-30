/* Die drei grossen Listen: Bibliothek, Verlauf, Übungs-Picker.

   Alle drei schreiben ihre Zeilen bei jedem Rendern neu und hängen ihre
   Klick-Behandlung am Container statt an der Zeile (delegiert). Genau da
   bricht so etwas erfahrungsgemäss: Die Liste sieht richtig aus, aber der
   Klick landet nirgends mehr. Deshalb wird hier jede Liste auch geklickt,
   nicht nur gezählt. */

const { js, klick, dawar, text, tippe, warte, warteAufSuche } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Listen';

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 60 }));
  await warte(page, 250);

  /* ── Bibliothek ───────────────────────────────────────────────────── */
  await js(page, `showScreen('scr-lib')`);
  await warte(page, 200);

  const alle = await js(page, `document.querySelectorAll('#lib-list [data-lib]').length`);
  p.mind('Bibliothek listet Übungen', alle, 50);

  await tippe(page, '#lib-search', 'bank');
  await warteAufSuche(page);
  const gesucht = await js(page, `document.querySelectorAll('#lib-list [data-lib]').length`);
  p.pruefe('Suche grenzt ein', gesucht > 0 && gesucht < alle, `${gesucht} von ${alle}`);

  await tippe(page, '#lib-search', 'zzzgibtesnicht');
  await warteAufSuche(page);
  p.gleich('Suche ohne Treffer zeigt keine Zeilen', await js(page, `document.querySelectorAll('#lib-list [data-lib]').length`), 0);
  p.enthaelt('Suche ohne Treffer erklärt sich', await text(page, '#lib-list'), 'Keine Übung gefunden');

  await tippe(page, '#lib-search', '');
  await warteAufSuche(page);

  /* Gruppen-Chips werden nur einmal gebaut und danach ummarkiert. */
  await klick(page, '#lib-groups .chip[data-g="Beine"]');
  await warte(page, 200);
  p.pruefe('Gruppen-Chip markiert sich', await js(page, `document.querySelector('#lib-groups .chip[data-g="Beine"]').classList.contains('on')`));
  const beine = await js(page, `document.querySelectorAll('#lib-list [data-lib]').length`);
  p.pruefe('Gruppen-Chip filtert', beine > 0 && beine < alle, `${beine} Bein-Übungen`);

  p.gleich('immer nur ein Chip aktiv', await js(page, `document.querySelectorAll('#lib-groups .chip.on').length`), 1);

  await klick(page, '#lib-groups .chip[data-g="Alle"]');
  await warte(page, 200);

  /* Favoriten lassen sich direkt in der Bibliothek verwalten. Der Stern
     öffnet nicht versehentlich die Statistik, der eigene Chip zeigt danach
     ausschließlich die gemerkten Übungen. */
  await js(page, `exStatId=null; state.settings.favEx=[]; saveState(); renderLib();`);
  const libFavId = await js(page, `document.querySelector('#lib-list [data-fav]').dataset.fav`);
  await klick(page, '#lib-list [data-fav]');
  await warte(page, 200);
  p.gleich('Bibliotheks-Stern öffnet nicht die Statistik', await js(page, 'exStatId'), null);
  p.pruefe('Bibliotheks-Stern speichert den Favoriten', await js(page, `(state.settings.favEx||[]).includes(${JSON.stringify(libFavId)})`));
  await klick(page, '#lib-groups .chip[data-g="Favoriten"]');
  await warte(page, 200);
  p.gleich('Favoriten-Filter zeigt genau den gemerkten Eintrag', await js(page, `document.querySelectorAll('#lib-list [data-lib]').length`), 1);
  await klick(page, '#lib-groups .chip[data-g="Alle"]');
  await warte(page, 200);

  /* Zeilenklick führt in die Übungsstatistik. */
  await klick(page, '#lib-list [data-lib]');
  await warte(page, 300);
  p.pruefe('Klick auf eine Übung öffnet ihre Statistik', await js(page, `!!exStatId`), await js(page, 'exStatId'));

  /* ── Verlauf ──────────────────────────────────────────────────────── */
  await js(page, `showScreen('scr-hist'); histFilter='Alle'; histLimit=40; document.querySelector('#hist-search').value=''; renderHist();`);
  await warte(page, 250);

  const stapel1 = await js(page, `document.querySelectorAll('#hist-list [data-wid]').length`);
  p.gleich('Verlauf zeigt den ersten Stapel', stapel1, 40);

  p.pruefe('„Weitere anzeigen" ist vorhanden', await dawar(page, '#hist-mehr'));
  await klick(page, '#hist-mehr');
  await warte(page, 250);
  p.gleich('„Weitere anzeigen" lädt nach', await js(page, `document.querySelectorAll('#hist-list [data-wid]').length`), 60);

  const chips = await js(page, `[...document.querySelectorAll('#hist-filters .chip')].map(c=>c.dataset.hf)`);
  p.mind('Verlauf hat Filter aus den echten Daten', chips.length, 3);
  p.pruefe('Filter enthalten die A/B-Trainingsarten', chips.includes('Push A') && chips.includes('Push B'), chips.join(', '));

  await klick(page, '#hist-filters .chip[data-hf="Push A"]');
  await warte(page, 250);
  const nurPush = await js(page, `document.querySelectorAll('#hist-list [data-wid]').length`);
  p.pruefe('Filter greift', nurPush > 0 && nurPush < 60, `${nurPush} Push-Einheiten`);
  p.pruefe('gefilterter Chip ist markiert', await js(page, `document.querySelector('#hist-filters .chip[data-hf="Push A"]').classList.contains('on')`));

  /* Filter und Suche greifen über ALLE Einheiten, nicht nur den Stapel. */
  const alleWs = await js(page, `state.workouts.length`);
  const zaehler = await text(page, '#hist-count');
  p.enthaelt('Zähler nennt die Gesamtmenge', zaehler, String(alleWs));

  await klick(page, '#hist-filters .chip[data-hf="Alle"]');
  await warte(page, 200);

  await klick(page, '#hist-list [data-wid]');
  await warte(page, 300);
  p.mind('Workout-Karte öffnet die Detailansicht', (await text(page, '#detail-body')).length, 100);
  await js(page, 'closeModals()');
  await warte(page, 200);

  /* Leerzustand der Suche bietet einen Ausweg an. */
  await tippe(page, '#hist-search', 'zzzgibtesnicht');
  await warteAufSuche(page);
  p.pruefe('Suche ohne Treffer bietet Zurücksetzen an', await dawar(page, '#hist-reset'));
  await klick(page, '#hist-reset');
  await warte(page, 250);
  p.gleich('Zurücksetzen stellt die Liste wieder her', await js(page, `document.querySelectorAll('#hist-list [data-wid]').length`), 40);

  /* ── Übungs-Picker ────────────────────────────────────────────────── */
  await js(page, `state.settings.favEx=[]; saveState(); window.__gewaehlt = null; openPicker(id => window.__gewaehlt = id);`);
  await warte(page, 250);

  p.mind('Picker listet Übungen', await js(page, `document.querySelectorAll('#pick-list [data-pick]').length`), 20);

  /* Der Favoritenstern darf den Picker NICHT schliessen — er liegt in der
     Zeile, die selbst die Auswahl auslöst. */
  if (await dawar(page, '#pick-list [data-fav]')) {
    await klick(page, '#pick-list [data-fav]');
    await warte(page, 250);
    p.gleich('Favoritenstern wählt nicht aus', await js(page, 'window.__gewaehlt'), null);
    p.mind('Favoritenstern schaltet den Favoriten um', await js(page, `(state.settings.favEx||[]).length`), 1);
    const doppelt = await js(page, `(() => { const ids=[...document.querySelectorAll('#pick-list [data-pick]')].map(x=>x.dataset.pick); return ids.length-new Set(ids).size; })()`);
    p.gleich('Schnellzugriff zeigt keine Übung doppelt', doppelt, 0);
    p.pruefe('Picker bietet einen Favoriten-Filter', await dawar(page, '#pick-groups .chip[data-g="Favoriten"]'));
  }

  await klick(page, '#pick-list [data-pick]');
  await warte(page, 250);
  p.pruefe('Picker-Zeile wählt aus', !!(await js(page, 'window.__gewaehlt')), await js(page, 'window.__gewaehlt'));
  await js(page, 'closeModals()');
};
