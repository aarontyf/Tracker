/* Kardio- und Zeitübungen.

   Diese Änderung fasst das Satzmodell an, in dem Jahre an Trainingsdaten
   liegen. Der grössere Teil dieser Suite prüft deshalb nicht die neue
   Funktion, sondern dass die ALTE unverändert weiterrechnet: Volumen,
   Rekorde, Satzzählung und e1RM dürfen sich durch Halteübungen weder
   verschieben noch verfälschen.

   Der gefährlichste Fehler wäre still: Ein Zeitsatz, der als 0 kg × 0 Wdh
   in die Kraftstatistik einfliesst, senkt keinen Wert und wirft keinen
   Fehler — er taucht nur als Nullpunkt in Diagrammen auf, die niemand
   mehr versteht. */

const { js, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Kardio';

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 30 }));
  await js(page, 'state.settings.lastBackup = Date.now(); saveState(); closeModals();');
  await warte(page, 250);

  /* ── Die Übungen sind da und richtig ausgezeichnet ─────────────────── */
  const arten = await js(page, `(() => {
    const zaehl = { kraft:0, zeit:0, kardio:0 };
    EXDB.forEach(e => zaehl[e.art || 'kraft']++);
    return zaehl;
  })()`);
  p.mind('Halteübungen sind vorhanden', arten.zeit, 10);
  p.mind('Kardioübungen sind vorhanden', arten.kardio, 10);
  p.mind('die Kraftdatenbank ist unverändert gross', arten.kraft, 337);

  const plank = await js(page, `(() => {
    const ex = EXDB.find(e => e.name === 'Unterarmstütz');
    return ex ? { id: ex.id, art: ex.art, gefunden: exArt(ex.id) } : null;
  })()`);
  p.pruefe('Unterarmstütz existiert', !!plank);
  p.gleich('Unterarmstütz ist als Zeitübung ausgezeichnet', plank.art, 'zeit');
  p.gleich('exArt liefert die Art', plank.gefunden, 'zeit');

  p.gleich('eine Kraftübung bleibt „kraft"', await js(page, `exArt(EXDB[0].id)`), 'kraft');
  p.gleich('unbekannte ID fällt auf „kraft" zurück', await js(page, `exArt('gibtsnicht')`), 'kraft');

  /* Die Behelfseinträge von früher bleiben unangetastet — dort liegt
     Historie, deren Zahlen nicht umgedeutet werden dürfen. */
  p.gleich('„Sek. als Wdh"-Behelf bleibt eine Kraftübung',
           await js(page, `(EXDB.find(e => e.name.includes('Tuck-Planche'))||{}).art`), 'kraft');

  /* ── Zeitsätze zählen, ohne die Kraftzahlen zu verschieben ─────────── */
  const vorher = await js(page, `({ vol: globalAgg().vol, saetze: globalAgg().sets })`);

  const nachher = await js(page, `(() => {
    const plank = EXDB.find(e => e.name === 'Unterarmstütz');
    const lauf  = EXDB.find(e => e.name === 'Laufband');
    const jetzt = Date.now();
    state.workouts.push({
      id:'zeit-1', date:new Date().toISOString(), type:'Push', start:jetzt-36e5, end:jetzt, prs:[],
      exercises:[
        { exId:plank.id, name:plank.name, sets:[{sek:60,ts:jetzt},{sek:75,ts:jetzt},{sek:45,ts:jetzt}] },
        { exId:lauf.id,  name:lauf.name,  sets:[{sek:1800, dist:5200, ts:jetzt}] },
      ]
    });
    saveState();
    const w = state.workouts[state.workouts.length-1];
    return {
      vol: globalAgg().vol, saetze: globalAgg().sets,
      wVol: wVolume(w), wSets: wSets(w),
      dauer: wDauerSek(w), dist: wDistM(w),
    };
  })()`);

  p.gleich('Volumen bleibt exakt gleich — Zeitsätze wiegen nichts', nachher.vol, vorher.vol);
  p.gleich('das Workout selbst hat kein Gewichtsvolumen', nachher.wVol, 0);
  p.gleich('Zeitsätze zählen trotzdem als Sätze', nachher.wSets, 4);
  p.gleich('Sätze insgesamt steigen um genau vier', nachher.saetze, vorher.saetze + 4);
  p.gleich('Gesamtdauer wird summiert', nachher.dauer, 60 + 75 + 45 + 1800);
  p.gleich('Strecke wird summiert', nachher.dist, 5200);

  /* ── Zeitsätze erzeugen keine Gewichts-Rekorde ─────────────────────── */
  const beste = await js(page, `(() => {
    const plank = EXDB.find(e => e.name === 'Unterarmstütz');
    const b = exBests(plank.id);
    return b ? { maxW:b.maxW, maxE:b.maxE, maxVol:b.maxVol, sessions:b.sessions } : null;
  })()`);
  p.pruefe('Halteübung taucht in der Historie auf', !!beste);
  if(beste){
    p.gleich('kein Arbeitsgewicht', beste.maxW, 0);
    p.gleich('kein e1RM', beste.maxE, 0);
    p.gleich('kein Volumen', beste.maxVol, 0);
    p.gleich('eine Einheit gezählt', beste.sessions, 1);
  }

  /* ── Muskelanrechnung: eine Planke ist ein Bauchsatz ───────────────── */
  const muskel = await js(page, `(() => {
    const w = state.workouts[state.workouts.length-1];
    return muscleSetsBy([w], 'direct');
  })()`);
  p.gleich('drei Planken zählen als drei direkte Bauchsätze', muskel.abs, 3);

  /* ── Speichern und Laden verliert weder Sekunden noch Strecke ──────── */
  const rund = await js(page, `(() => {
    saveState(); loadState();
    const w = state.workouts.find(x => x.id === 'zeit-1');
    if (!w) return { da:false };
    const p = w.exercises[0].sets, l = w.exercises[1].sets[0];
    return { da:true, sek:p.map(s=>s.sek), dist:l.dist, laufSek:l.sek };
  })()`);
  p.gleich('das Zeit-Workout überlebt einen Neuladevorgang', rund.da, true);
  p.gleich('Sekunden bleiben erhalten', JSON.stringify(rund.sek), JSON.stringify([60,75,45]));
  p.gleich('Strecke bleibt erhalten', rund.dist, 5200);

  /* ── Das Abschliessen darf sie nicht verschlucken ──────────────────
     Genau hier sind rr und ts schon zweimal still verschwunden. */
  const abschluss = await js(page, `(async () => {
    /* finishWorkout() fragt über ask() nach. Ohne Zustimmung wartet es
       endlos — im Test wird die Rückfrage deshalb kurz stillgelegt. */
    const askOrig = ask;
    ask = async () => true;
    const plank = EXDB.find(e => e.name === 'Unterarmstütz');
    const lauf  = EXDB.find(e => e.name === 'Laufband');
    state.active = { id:'akt', date:new Date().toISOString(), type:'Push', start:Date.now()-36e5,
      exercises:[
        { exId:plank.id, name:plank.name, sets:[{sek:'90'},{sek:''}] },
        { exId:lauf.id,  name:lauf.name,  sets:[{sek:'1200', dist:'3500'}] },
      ]};
    await finishWorkout();
    ask = askOrig;
    const w = state.workouts[state.workouts.length-1];
    return {
      uebungen: w.exercises.length,
      plankSaetze: w.exercises[0].sets.length,
      sek: w.exercises[0].sets[0].sek,
      laufSek: w.exercises[1].sets[0].sek,
      laufDist: w.exercises[1].sets[0].dist,
    };
  })()`);
  p.gleich('beide Übungen landen im fertigen Workout', abschluss.uebungen, 2);
  p.gleich('leere Sätze fallen wie gewohnt raus', abschluss.plankSaetze, 1);
  p.gleich('Sekunden überleben das Abschliessen', abschluss.sek, 90);
  p.gleich('Kardio-Sekunden überleben', abschluss.laufSek, 1200);
  p.gleich('Kardio-Strecke überlebt', abschluss.laufDist, 3500);

  /* ── Darstellung im Training ───────────────────────────────────────── */
  await js(page, `(() => {
    const plank = EXDB.find(e => e.name === 'Unterarmstütz');
    const lauf  = EXDB.find(e => e.name === 'Laufband');
    state.active = { id:'akt2', date:new Date().toISOString(), type:'Push', start:Date.now(),
      exercises:[
        { exId:plank.id, name:plank.name, sets:[{sek:''},{sek:''}] },
        { exId:lauf.id,  name:lauf.name,  sets:[{sek:'', dist:''}] },
      ]};
    saveState(); showScreen('scr-train'); renderTrain();
  })()`);
  await warte(page, 350);

  p.mind('Zeitzeilen werden gezeichnet', await js(page, `document.querySelectorAll('.setrow.zeit').length`), 2);
  p.mind('Kardiozeilen werden gezeichnet', await js(page, `document.querySelectorAll('.setrow.kardio').length`), 1);
  p.gleich('eine Zeitzeile hat kein Gewichtsfeld', await js(page, `document.querySelectorAll('.setrow.zeit [data-f=w]').length`), 0);
  p.gleich('eine Zeitzeile hat kein Wiederholungsfeld', await js(page, `document.querySelectorAll('.setrow.zeit [data-f=r]').length`), 0);
  p.mind('eine Zeitzeile hat ein Sekundenfeld', await js(page, `document.querySelectorAll('.setrow.zeit [data-f=sek]').length`), 2);
  p.mind('eine Kardiozeile hat ein Streckenfeld', await js(page, `document.querySelectorAll('.setrow.kardio [data-f=dist]').length`), 1);
  p.gleich('Sekundenfeld ist beschriftet',
           await js(page, `document.querySelector('.setrow.zeit [data-f=sek]').getAttribute('aria-label')`), 'Sekunden');

  /* Eingabe markiert den Satz als gemacht und stempelt ihn. */
  const eingabe = await js(page, `(() => {
    const inp = document.querySelector('.setrow.zeit [data-f=sek]');
    inp.value = '60';
    inp.dispatchEvent(new Event('input', { bubbles:true }));
    const row = inp.closest('.setrow');
    const set = state.active.exercises[+row.dataset.ei].sets[+row.dataset.si];
    return { markiert: row.classList.contains('filled'), sek: set.sek, gestempelt: !!set.ts };
  })()`);
  p.gleich('Eingabe markiert den Satz als gemacht', eingabe.markiert, true);
  p.gleich('der Wert landet im Zustand', eingabe.sek, '60');
  p.gleich('der Satz bekommt einen Zeitstempel', eingabe.gestempelt, true);

  /* ── Formatierung ─────────────────────────────────────────────────── */
  const fmt = await js(page, `({
    s45: fmtSek(45), s60: fmtSek(60), s90: fmtSek(90), s1800: fmtSek(1800), s5400: fmtSek(5400),
    d500: fmtDist(500), d5200: fmtDist(5200), d0: fmtDist(0)
  })`);
  p.gleich('unter einer Minute in Sekunden', fmt.s45, '45 s');
  p.gleich('glatte Minute ohne Sekunden', fmt.s60, '1 min');
  p.gleich('Minuten mit Sekunden', fmt.s90, '1:30 min');
  p.gleich('halbe Stunde', fmt.s1800, '30 min');
  p.gleich('über eine Stunde', fmt.s5400, '1:30 h');
  p.gleich('kurze Strecke in Metern', fmt.d500, '500 m');
  p.gleich('lange Strecke in Kilometern', fmt.d5200, '5,2 km');
  p.gleich('keine Strecke bleibt leer', fmt.d0, '');


  /* ── Verlauf zeigt bei Kardio Dauer statt „0 kg" ───────────────────── */
  await js(page, `(() => {
    const lauf = EXDB.find(e => e.name === 'Laufband');
    const jetzt = Date.now();
    state.workouts = [{ id:'nur-kardio', date:new Date().toISOString(), type:'Push',
      start:jetzt-36e5, end:jetzt, prs:[],
      exercises:[{ exId:lauf.id, name:lauf.name, sets:[{sek:1800, dist:5200, ts:jetzt}] }] }];
    saveState(); showScreen('scr-hist'); histFilter='Alle'; histLimit=40;
    document.querySelector('#hist-search').value=''; renderHist();
  })()`);
  await warte(page, 300);
  const kartenTxt = await js(page, `document.querySelector('#hist-list [data-wid]').textContent`);
  p.pruefe('reine Kardio-Einheit zeigt kein „0 kg"', !/\b0 kg\b/.test(kartenTxt), kartenTxt.replace(/\s+/g,' ').trim().slice(0,80));
  p.enthaelt('reine Kardio-Einheit zeigt die Dauer', kartenTxt, '30 min');
  p.enthaelt('reine Kardio-Einheit zeigt die Strecke', kartenTxt, '5,2 km');


  /* ── Nahtstelle zum Nachbearbeiten-Editor (V71) ────────────────────
     Der Editor und das Abschliessen teilen sich satzFuerSpeicher(). Genau
     deshalb stehen sek und dist dort und nicht in finishWorkout(): Sonst
     ueberlebten Halteuebungen das Abschliessen und verschwaenden beim
     Korrigieren still — dieselbe Falle, an der rr und ts schon zweimal
     fast gestorben sind. */
  const editor = await js(page, `(() => {
    if (typeof satzFuerSpeicher !== 'function') return 'satzFuerSpeicher fehlt';
    const roh = { w:'', r:'', sek:'90', dist:'2500', ts:Date.now(), rir:'2' };
    const gespeichert = satzFuerSpeicher(roh);
    const ergebnis = { sek: gespeichert.sek, dist: gespeichert.dist, rir: gespeichert.rir };
    if (typeof uebungFuerBearbeitung === 'function') {
      const lauf = EXDB.find(e => e.name === 'Laufband');
      const e = { exId: lauf.id, name: lauf.name, sets: [roh] };
      const o = uebungFuerBearbeitung(e, new Date().toISOString());
      ergebnis.ueberEditor = o.sets[0] ? { sek: o.sets[0].sek, dist: o.sets[0].dist } : null;
    }
    return ergebnis;
  })()`);
  p.gleich('satzFuerSpeicher behaelt die Sekunden', editor.sek, 90);
  p.gleich('satzFuerSpeicher behaelt die Strecke', editor.dist, 2500);
  p.gleich('vorhandene Felder bleiben unberuehrt', editor.rir, 2);
  if (editor.ueberEditor) {
    p.gleich('Nachbearbeiten-Editor behaelt die Sekunden', editor.ueberEditor.sek, 90);
    p.gleich('Nachbearbeiten-Editor behaelt die Strecke', editor.ueberEditor.dist, 2500);
  }

  await js(page, 'state.active = null; saveState(); renderAll();');
};
