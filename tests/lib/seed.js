/* ══════════════════════════════════════════════════════════════════════
   Testdaten.

   Wird als Ausdruck IM Browser ausgewertet, weil die Übungs-IDs aus EXDB
   stammen — die Datenbank liegt in der HTML-Datei, nicht hier.

   Alles ist deterministisch: derselbe Startwert erzeugt denselben Datensatz.
   Ohne das wären Testfehler nicht reproduzierbar.
   ══════════════════════════════════════════════════════════════════════ */

/* Datenform, gegen die hier gebaut wird (aus finishWorkout() der App):
     workout  {id, date, start, end, type, exercises:[…], prs:[…]}
     exercise {exId, name, sets:[…]}
     satz     {w, r, rr?, t?, rir?, ts?}   t: 'w'=Aufwärmen, 'd'=Dropset   */

/**
 * @param {object} o
 * @param {number} o.workouts  Anzahl Einheiten (Standard 60)
 * @param {number} o.uebungen  Übungen je Einheit (Standard 5)
 * @param {number} o.saetze    Sätze je Übung (Standard 4)
 * @param {number} o.tage      Abstand der Einheiten in Tagen (Standard 2)
 * @param {number} o.seed      Startwert des Zufallsgenerators
 * @returns {string} im Browser auswertbarer Ausdruck, liefert eine Kurzstatistik
 */
function seedCode(o = {}) {
  const cfg = {
    workouts: o.workouts ?? 60,
    uebungen: o.uebungen ?? 5,
    saetze:   o.saetze   ?? 4,
    tage:     o.tage     ?? 2,
    seed:     o.seed     ?? 42,
    bodyweight: o.bodyweight ?? true,
  };

  return `(() => {
  const cfg = ${JSON.stringify(cfg)};

  /* Mulberry32 — kleiner, reproduzierbarer Generator. */
  let s = cfg.seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ganz = (min, max) => min + Math.floor(rnd() * (max - min + 1));

  /* Übungen mit Gewicht, aus verschiedenen Gruppen — Körpergewichts- und
     Assistenzübungen rechnen anders und würden die Erwartungswerte verwischen. */
  const pool = EXDB.filter(e => !/Körpergewicht|Assist/i.test(e.eq || '')).slice(0, 80);
  const typen = ['Push', 'Pull', 'Beine'];
  const jetzt = Date.now();
  const ws = [];

  for (let i = 0; i < cfg.workouts; i++) {
    /* Neueste zuerst erzeugen, Liste am Ende umdrehen: state.workouts ist
       aufsteigend nach Datum sortiert, so wie die App es selbst hält. */
    const start = jetzt - i * cfg.tage * 864e5;
    const datum = new Date(start).toISOString();
    const uebungen = [];

    for (let j = 0; j < cfg.uebungen; j++) {
      const ex = pool[(i * cfg.uebungen + j) % pool.length];
      const basis = 40 + ((i * 7 + j * 13) % 60);
      const sets = [];

      for (let k = 0; k < cfg.saetze; k++) {
        const satz = {
          /* Leichter Aufbau über die Zeit, damit Rekorde und Progression
             etwas zu erkennen haben. */
          w: basis + Math.floor((cfg.workouts - i) / 10) * 2.5 + k * 2.5,
          r: Math.max(3, 10 - k + ganz(-1, 1)),
          ts: start + k * 18e4,
        };
        if (k === 0) satz.t = 'w';              // erster Satz als Aufwärmsatz
        if (rnd() < 0.3) satz.rir = ganz(0, 3);
        sets.push(satz);
      }
      uebungen.push({ exId: ex.id, name: ex.name, sets });
    }

    ws.push({
      id: 'seed-w' + i,
      date: datum,
      start: start,
      end: start + ganz(45, 80) * 6e4,
      type: typen[i % typen.length],
      exercises: uebungen,
      prs: [],
    });
  }

  ws.reverse();                                  // ältestes zuerst
  state.workouts = ws;

  if (cfg.bodyweight) {
    state.bodyweight = [];
    for (let i = cfg.workouts; i >= 0; i -= 3) {
      const d = new Date(jetzt - i * cfg.tage * 864e5).toISOString().slice(0, 10);
      state.bodyweight.push({ d, kg: 78 + Math.round((rnd() * 2 - 1) * 10) / 10 });
    }
  }

  /* Über saveState() gehen, damit dieselben Caches verworfen werden wie im
     Echtbetrieb — sonst testet man gegen Zwischenstände, die es nie gibt. */
  saveState();
  renderAll();

  return {
    workouts: state.workouts.length,
    saetze: state.workouts.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0),
    uebungen: new Set(state.workouts.flatMap(w => w.exercises.map(e => e.exId))).size,
  };
})()`;
}

/* Setzt die App auf den Zustand eines frischen Geräts zurück. */
const leerCode = `(() => {
  state.workouts = [];
  state.bodyweight = [];
  state.measures = [];
  state.templates = [];
  state.customEx = [];
  state.ach = {};
  state.active = null;
  saveState();
  renderAll();
  return state.workouts.length;
})()`;

module.exports = { seedCode, leerCode };
