/* Daten, Caches und kaputte Zustände.

   Hier liegen Aarons Trainingsdaten — ein Fehler in diesem Bereich ist
   nicht „hässlich", sondern kostet Jahre an Historie. Die App hat dafür
   repariereState(); diese Suite prüft, dass die Reparatur wirklich greift,
   statt sich darauf zu verlassen, dass sie im Code steht. */

const { js, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Daten';

/* Lädt einen rohen localStorage-Inhalt und startet die App neu darauf.
   Genau der Weg, den ein beschädigter Speicher im Echtbetrieb nimmt. */
const ladeRoh = (page, rohesObjekt) => js(page, `(() => {
  try {
    localStorage.setItem(LS_KEY, ${JSON.stringify(JSON.stringify(rohesObjekt))});
    loadState();
    renderAll();
    return { ok: true, workouts: (state.workouts||[]).length };
  } catch (e) {
    return { ok: false, fehler: String(e) };
  }
})()`);

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 40 }));
  await warte(page, 250);

  /* ── Speichern und Laden ist verlustfrei ──────────────────────────── */
  const rund = await js(page, `(() => {
    const vorher = JSON.stringify(state.workouts);
    saveState();
    loadState();
    return { gleich: JSON.stringify(state.workouts) === vorher, n: state.workouts.length };
  })()`);
  p.pruefe('Speichern und Laden verändert die Historie nicht', rund.gleich, `${rund.n} Einheiten`);

  /* ── Caches verfallen nach Datenänderungen ────────────────────────── */
  const caches = await js(page, `(() => {
    const vorVol = globalAgg().vol;
    const vorTrained = trainedExIds().size;
    const vorEx = allExercises().length;

    const exId = EXDB[300].id;
    state.workouts.push({
      id: 'cache-test', date: new Date().toISOString(), type: 'Push',
      exercises: [{ exId, name: getEx(exId).name, sets: [{ w: 999, r: 5, ts: Date.now() }] }],
      start: Date.now() - 36e5, end: Date.now(), prs: []
    });
    saveState();

    state.customEx.push({ id: 'cache-ex', name: 'Cachetest Übung', grp: 'Brust',
                          eq: 'Kurzhantel', p: ['chest'], s: [], al: '', custom: true });
    invalidateSearch();

    return {
      volVorher: vorVol, volNachher: globalAgg().vol,
      trainedVorher: vorTrained, trainedNachher: trainedExIds().size,
      exVorher: vorEx, exNachher: allExercises().length,
      neuFindbar: !!getEx('cache-ex'),
      neuSuchbar: filterEx('cachetest', 'Alle').some(e => e.id === 'cache-ex'),
    };
  })()`);

  p.pruefe('Lifetime-Volumen erneuert sich nach saveState', caches.volNachher > caches.volVorher,
           `${caches.volVorher} → ${caches.volNachher}`);
  p.gleich('„schon trainiert" erneuert sich', caches.trainedNachher, caches.trainedVorher + 1);
  p.gleich('neue eigene Übung landet im Übungscache', caches.exNachher, caches.exVorher + 1);
  p.pruefe('neue eigene Übung ist über getEx auffindbar', caches.neuFindbar);
  p.pruefe('neue eigene Übung ist sofort suchbar', caches.neuSuchbar);

  /* ── Kaputte Zustände dürfen die App nicht lahmlegen ───────────────
     Sechs Formen, die laut Code-Kommentar schon einmal zum weissen
     Bildschirm geführt haben. Jede muss aufgefangen werden. */
  const heute = new Date().toISOString();
  const kaputt = {
    'Workout ohne exercises':        { workouts: [{ id: 'a', date: heute, type: 'Push' }] },
    'sets als Text statt Liste':     { workouts: [{ id: 'b', date: heute, type: 'Push', exercises: [{ exId: 'x', name: 'X', sets: 'kaputt' }] }] },
    'null in der Übungsliste':       { workouts: [{ id: 'c', date: heute, type: 'Push', exercises: [null] }] },
    'null in der Satzliste':         { workouts: [{ id: 'd', date: heute, type: 'Push', exercises: [{ exId: 'x', name: 'X', sets: [null] }] }] },
    'workouts ist kein Array':       { workouts: 'kaputt' },
    'active ohne exercises':         { workouts: [], active: { id: 'e', date: heute, start: Date.now() } },
    'Satz mit Text statt Zahlen':    { workouts: [{ id: 'f', date: heute, type: 'Push', exercises: [{ exId: 'x', name: 'X', sets: [{ w: 'viel', r: 'oft' }] }] }] },
    'settings ist null':             { workouts: [], settings: null },
  };

  for (const [name, roh] of Object.entries(kaputt)) {
    const r = await ladeRoh(page, roh);
    p.pruefe(`überlebt: ${name}`, r.ok === true, r.ok ? '' : r.fehler);

    /* Nicht nur laden — auch zeichnen. Der weisse Bildschirm entstand
       früher erst beim Rendern, nicht beim Laden. */
    const gezeichnet = await js(page, `(() => { try { renderAll(); return true; } catch(e){ return String(e); } })()`);
    p.gleich(`zeichnet nach: ${name}`, gezeichnet, true);
  }

  /* Auch komplett unlesbarer Speicher darf nur zu einem leeren Start führen. */
  const muell = await js(page, `(() => {
    try { localStorage.setItem(LS_KEY, '{kein json'); loadState(); renderAll(); return true; }
    catch(e){ return String(e); }
  })()`);
  p.gleich('überlebt unlesbaren Speicher', muell, true);

  /* ── Rückgängig ───────────────────────────────────────────────────── */
  const undo = await js(page, `(() => {
    return typeof withUndo === 'function';
  })()`);
  p.pruefe('Rückgängig-System vorhanden', undo);
};
