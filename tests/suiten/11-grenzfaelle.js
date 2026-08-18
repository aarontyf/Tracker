/* Grenzfälle und Fehlersuche.

   Diese Suite prüft keine Funktion, sondern sucht Fehler. Sie wirft der App
   Werte hin, die im Alltag selten vorkommen, aber garantiert irgendwann
   auftreten: vertippte Zahlen, ein Datum in der Zukunft, ein Übungsname mit
   spitzen Klammern, eine Historie mit genau einem Eintrag.

   Was hier durchfällt, ist ein Fehler — kein Randfall, den man wegdiskutiert. */

const { js, warte, text } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Grenzfälle';

/* Setzt einen Zustand und versucht, alles zu zeichnen. Liefert die
   Ausnahme als Text, falls es knallt. */
const zeichneMit = (page, aufbau) => js(page, `(() => {
  try {
    ${aufbau}
    renderAll();
    return true;
  } catch(e) { return String(e && e.message || e); }
})()`);

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 20 }));
  await js(page, 'state.settings.lastBackup = Date.now(); saveState(); closeModals();');
  await warte(page, 250);

  /* ── Unsinnige Zahlen in Sätzen ───────────────────────────────────── */
  const zahlen = {
    'negatives Gewicht':      { w:-50, r:10 },
    'negative Wiederholungen':{ w:50, r:-10 },
    'riesiges Gewicht':       { w:1e9, r:10 },
    'riesige Wiederholungen': { w:50, r:1e9 },
    'Nachkommastellen':       { w:52.3456789, r:8 },
    'Text statt Zahl':        { w:'viel', r:'oft' },
    'null-Werte':             { w:null, r:null },
    'Unendlich':              { w:Infinity, r:10 },
    'NaN':                    { w:NaN, r:NaN },
  };
  for(const [name, satz] of Object.entries(zahlen)){
    const r = await zeichneMit(page, `
      const ex = EXDB[0];
      state.workouts = [{ id:'g1', date:new Date().toISOString(), type:'Push',
        start:Date.now()-36e5, end:Date.now(), prs:[],
        exercises:[{ exId:ex.id, name:ex.name, sets:[${JSON.stringify(satz)}] }] }];
      saveState();`);
    p.gleich(`überlebt: ${name}`, r, true);
  }

  /* Kein Volumen darf negativ oder unendlich sein — das würde sich durch
     jede Statistik ziehen. */
  const volPruef = await js(page, `(() => {
    const ex = EXDB[0];
    /* Namen mitfuehren: JSON.stringify(Infinity) ergibt null, und dann steht
       im Testbericht ein Fall, den es gar nicht gibt. */
    const faelle = [
      ['negatives Gewicht', {w:-50,r:10}],
      ['negative Wiederholungen', {w:50,r:-10}],
      ['Gewicht Infinity', {w:Infinity,r:10}],
      ['Gewicht NaN', {w:NaN,r:5}],
      ['sehr grosse Zahlen', {w:1e9,r:1e9}],
    ];
    return faelle.map(([name, s]) => {
      state.workouts = [{ id:'v', date:new Date().toISOString(), type:'Push',
        start:Date.now(), end:Date.now(), prs:[],
        exercises:[{ exId:ex.id, name:ex.name, sets:[s] }] }];
      const v = wVolume(state.workouts[0]);
      return { satz:name, vol:v, endlich:isFinite(v), nichtNegativ:v >= 0 };
    });
  })()`);
  volPruef.forEach(x => {
    p.pruefe(`Volumen bleibt endlich bei ${x.satz}`, x.endlich, String(x.vol));
    p.pruefe(`Volumen wird nicht negativ bei ${x.satz}`, x.nichtNegativ, String(x.vol));
  });

  /* ── Datumsgrenzen ────────────────────────────────────────────────── */
  const daten = {
    'Datum in der Zukunft':  new Date(Date.now() + 400*864e5).toISOString(),
    'sehr altes Datum':      '1990-01-01T10:00:00.000Z',
    'ungültiges Datum':      'kein-datum',
    'leeres Datum':          '',
    'Datum als Zahl':        Date.now(),
  };
  for(const [name, datum] of Object.entries(daten)){
    /* Über localStorage und loadState() statt state direkt zu setzen: So
       laeuft die Zustandsreparatur mit, und genau sie ist es, die kaputte
       Datumsformen geradezieht. Wer hier am Ladeweg vorbei prueft, testet
       einen Pfad, den es im Betrieb gar nicht gibt. */
    const r = await js(page, `(() => {
      try {
        const ex = EXDB[0];
        localStorage.setItem(LS_KEY, JSON.stringify({ workouts: [{
          id:'d1', date:${JSON.stringify(datum)}, type:'Push',
          start:Date.now()-36e5, end:Date.now(), prs:[],
          exercises:[{ exId:ex.id, name:ex.name, sets:[{w:50,r:8}] }] }] }));
        loadState();
        renderAll();
        return true;
      } catch(e) { return String(e && e.message || e); }
    })()`);
    p.gleich(`überlebt: ${name}`, r, true);
  }

  /* Nach der Reparatur muss das Datum eine Zeichenkette sein — daran haengen
     alle .slice(0,10)-Aufrufe. */
  p.gleich('Datum ist nach der Reparatur eine Zeichenkette',
           await js(page, `typeof (state.workouts[0]||{}).date`), 'string');

  /* ── Ende vor Anfang ──────────────────────────────────────────────── */
  const dauer = await js(page, `(() => {
    const ex = EXDB[0];
    const jetzt = Date.now();
    state.workouts = [{ id:'t1', date:new Date().toISOString(), type:'Push',
      start:jetzt, end:jetzt - 36e5, prs:[],
      exercises:[{ exId:ex.id, name:ex.name, sets:[{w:50,r:8}] }] }];
    saveState();
    const d = wDauer(state.workouts[0]);
    return { dauer:d, nichtNegativ:d >= 0, endlich:isFinite(d) };
  })()`);
  p.pruefe('Trainingsdauer wird nicht negativ, wenn Ende vor Anfang liegt',
           dauer.nichtNegativ && dauer.endlich, String(dauer.dauer));

  /* ── Gefährliche Zeichen in Namen ──────────────────────────────────
     Eigene Übungen und Notizen landen im HTML. Wird dort nicht maskiert,
     zerlegt der erste Name mit spitzen Klammern die Seite. */
  const boese = '<img src=x onerror="window.__geknackt=1">';
  const injektion = await js(page, `(() => {
    window.__geknackt = 0;
    state.customEx = [{ id:'cx1', name:${JSON.stringify(boese)}, grp:'Brust',
                        eq:'Kurzhantel', p:['chest'], s:[], al:'', custom:true }];
    if (typeof invalidateSearch === 'function') invalidateSearch();
    state.workouts = [{ id:'x1', date:new Date().toISOString(), type:'Push',
      start:Date.now()-36e5, end:Date.now(), prs:[],
      exercises:[{ exId:'cx1', name:${JSON.stringify(boese)}, note:${JSON.stringify(boese)},
                   sets:[{w:50,r:8}] }] }];
    saveState();
    showScreen('scr-lib'); renderLib();
    showScreen('scr-hist'); renderHist();
    renderAll();
    return { geknackt: window.__geknackt, bilder: document.querySelectorAll('img[src=x]').length };
  })()`);
  await warte(page, 300);
  p.gleich('ein Übungsname mit HTML wird nicht ausgeführt', injektion.geknackt, 0);
  p.gleich('kein eingeschleustes Element im Dokument', injektion.bilder, 0);

  /* ── Doppelte IDs ─────────────────────────────────────────────────── */
  const doppelt = await zeichneMit(page, `
    const ex = EXDB[0];
    const mach = id => ({ id, date:new Date().toISOString(), type:'Push',
      start:Date.now()-36e5, end:Date.now(), prs:[],
      exercises:[{ exId:ex.id, name:ex.name, sets:[{w:50,r:8}] }] });
    state.workouts = [mach('gleich'), mach('gleich'), mach('gleich')];
    saveState();`);
  p.gleich('überlebt drei Workouts mit derselben ID', doppelt, true);

  /* ── Genau ein Eintrag ────────────────────────────────────────────
     Einzelwerte sind der klassische Ort für Division durch null,
     Math.max() ohne Argumente und Trendlinien aus einem Punkt. */
  const einzeln = await zeichneMit(page, `
    const ex = EXDB[0];
    state.workouts = [{ id:'e1', date:new Date().toISOString(), type:'Push',
      start:Date.now()-36e5, end:Date.now(), prs:[],
      exercises:[{ exId:ex.id, name:ex.name, sets:[{w:50,r:8}] }] }];
    state.bodyweight = [{ d:new Date().toISOString().slice(0,10), kg:80 }];
    state.measures = [{ d:new Date().toISOString().slice(0,10), arm:38 }];
    saveState();
    showScreen('scr-stats'); renderStats();`);
  p.gleich('überlebt eine Historie mit genau einem Eintrag', einzeln, true);

  /* ── Übung, die es nicht mehr gibt ────────────────────────────────
     Nach einem Umbenennen der Datenbank oder einer gelöschten eigenen
     Übung zeigen Altdaten ins Leere. */
  const verwaist = await zeichneMit(page, `
    state.customEx = [];
    state.workouts = [{ id:'w1', date:new Date().toISOString(), type:'Push',
      start:Date.now()-36e5, end:Date.now(), prs:[],
      exercises:[{ exId:'gibt-es-nicht-mehr', name:'Verschwunden', sets:[{w:50,r:8}] }] }];
    saveState();
    showScreen('scr-hist'); renderHist();
    showScreen('scr-stats'); renderStats();`);
  p.gleich('überlebt eine Übung, die es nicht mehr gibt', verwaist, true);

  /* ── Sehr grosse Historie ─────────────────────────────────────────── */
  const gross = await js(page, `(() => {
    const t = performance.now();
    try {
      const ex = EXDB[0];
      const ws = [];
      for(let i=0;i<1000;i++){
        const s = Date.now() - i*864e5;
        ws.push({ id:'m'+i, date:new Date(s).toISOString(), type:'Push',
          start:s, end:s+36e5, prs:[],
          exercises:[{ exId:ex.id, name:ex.name, sets:[{w:50,r:8},{w:55,r:6}] }] });
      }
      state.workouts = ws.reverse();
      saveState();
      renderAll();
      return { ok:true, ms: Math.round(performance.now()-t) };
    } catch(e){ return { ok:false, fehler:String(e) }; }
  })()`);
  p.gleich('überlebt 1000 Einheiten', gross.ok, true, gross.fehler || '');
  p.hoechstens('1000 Einheiten zeichnen in vertretbarer Zeit (ms)', gross.ms || 0, 8000);

  /* ── Ziele mit Grenzwerten ────────────────────────────────────────── */
  const zieleRand = await zeichneMit(page, `
    const heute = new Date().toISOString().slice(0,10);
    state.goals = [
      { id:'z1', art:'workouts', ziel:0,        start:0,  bis:heute, angelegt:heute, erreicht:null },
      { id:'z2', art:'workouts', ziel:1e9,      start:0,  bis:heute, angelegt:heute, erreicht:null },
      { id:'z3', art:'workouts', ziel:10,       start:10, bis:heute, angelegt:heute, erreicht:null },
      { id:'z4', art:'koerper',  ziel:-5,       start:80, bis:heute, angelegt:heute, erreicht:null },
      { id:'z5', art:'e1rm',     ziel:100, exId:'gibtsnicht', start:0, bis:heute, angelegt:heute, erreicht:null },
    ];
    saveState();`);
  p.gleich('überlebt Ziele mit Grenzwerten', zieleRand, true);

  const zielZahlen = await js(page, `(() => {
    return zieleListe().map(g => {
      const s = zielStand(g);
      return { id:g.id, anteil:s.anteil, endlich:isFinite(s.anteil),
               imBereich: s.anteil >= 0 && s.anteil <= 1 };
    });
  })()`);
  zielZahlen.forEach(z => {
    p.pruefe(`Zielanteil ${z.id} ist eine endliche Zahl`, z.endlich, String(z.anteil));
    p.pruefe(`Zielanteil ${z.id} liegt zwischen 0 und 1`, z.imBereich, String(z.anteil));
  });

  /* ── Aufräumen, damit die Abschlussprüfung sauber läuft ───────────── */
  await js(page, `state.workouts=[]; state.goals=[]; state.customEx=[]; saveState(); renderAll();`);
};
