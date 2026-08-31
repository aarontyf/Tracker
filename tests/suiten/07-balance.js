/* Muskel-Balance als aktive Meldung.

   Das Risiko dieser Funktion ist nicht, dass sie ein Ungleichgewicht
   übersieht — sondern dass sie zu oft meldet. Eine Warnung, die bei jedem
   normalen Trainingsplan aufpoppt, wird nach einer Woche ignoriert und ist
   dann für immer wertlos. Der grössere Teil dieser Suite prüft deshalb,
   wann die Meldung SCHWEIGT. */

const { js, dawar, text, warte } = require('../lib/browser');

exports.name = 'Balance';

/* Baut eine Historie mit vorgegebenen Sätzen je Muskel.
   verteilung: { muskelSchluessel: saetzeProEinheit } */
const baue = (page, verteilung, einheiten = 12, tageAbstand = 2) => js(page, `(() => {
  const vert = ${JSON.stringify(verteilung)};
  /* Für jeden Muskel eine Übung suchen, die ihn PRIMÄR trifft und möglichst
     wenig sekundär streut — sonst verwischen die Erwartungswerte. */
  const treffer = {};
  for (const mk of Object.keys(vert)) {
    const ex = EXDB.filter(e => e.p.length === 1 && e.p[0] === mk)
                   .sort((a,b) => a.s.length - b.s.length)[0]
            || EXDB.find(e => e.p.includes(mk));
    if (ex) treffer[mk] = ex;
  }
  const ws = [];
  for (let i = 0; i < ${einheiten}; i++) {
    const start = Date.now() - i * ${tageAbstand} * 864e5;
    const uebungen = [];
    for (const [mk, n] of Object.entries(vert)) {
      const ex = treffer[mk]; if (!ex || n <= 0) continue;
      const sets = [];
      for (let k = 0; k < n; k++) sets.push({ w: 50, r: 8, ts: start + k * 6e4 });
      uebungen.push({ exId: ex.id, name: ex.name, sets });
    }
    ws.push({ id: 'b' + i, date: new Date(start).toISOString(), type: 'Push',
              exercises: uebungen, start, end: start + 36e5, prs: [] });
  }
  ws.reverse();
  state.workouts = ws;
  state.settings.lastBackup = Date.now();
  saveState();
  closeModals();
  renderHome();
  return { einheiten: ws.length, befunde: balanceBefunde().map(b => b.schwach) };
})()`);

const befunde = page => js(page, 'balanceBefunde()');

exports.lauf = async ({ page, p }) => {

  /* ── Schweigen: zu wenig Daten ────────────────────────────────────── */
  await baue(page, { chest: 4, lats: 1 }, 3);
  await warte(page, 200);
  p.gleich('bei unter vier Einheiten keine Meldung', (await befunde(page)).length, 0);
  p.gleich('Kasten bleibt leer', (await text(page, '#home-balance')).trim(), '');

  /* ── Schweigen: ausgewogener Plan ─────────────────────────────────── */
  await baue(page, { chest: 3, lats: 3, front_delt: 2, rear_delt: 2,
                     quads: 3, hamstrings: 3, triceps: 2, biceps: 2 }, 12);
  await warte(page, 200);
  const aus = await befunde(page);
  p.gleich('ausgewogener Plan meldet nichts', aus.length, 0, JSON.stringify(aus));

  /* ── Schweigen: kleine Zahlen sind Rauschen ───────────────────────── */
  await baue(page, { chest: 1, lats: 0 }, 5);      // 5 vs 0 Sätze — unter der Schwelle
  await warte(page, 200);
  p.gleich('kleine absolute Zahlen melden nicht', (await befunde(page)).length, 0);

  /* ── Schweigen: leichtes Ungleichgewicht ist normal ───────────────── */
  await baue(page, { chest: 3, lats: 2.5 }, 12);
  await warte(page, 200);
  p.gleich('Verhältnis unter 1,5 meldet nicht', (await befunde(page)).length, 0);

  /* ── Melden: echtes Ungleichgewicht ───────────────────────────────── */
  const r = await baue(page, { chest: 6, lats: 1 }, 12);
  await warte(page, 250);
  const b = await befunde(page);
  p.mind('deutliches Ungleichgewicht wird gemeldet', b.length, 1);
  if (b.length) {
    p.gleich('die schwache Seite wird richtig benannt', b[0].schwach, 'Rücken');
    p.gleich('die starke Seite wird richtig benannt', b[0].stark, 'Brust');
    p.mind('Verhältnis wird berechnet', b[0].verhaeltnis, 1.5);
    p.mind('es wird eine konkrete Satzzahl genannt', b[0].noetig, 1);
  }

  const txt = await text(page, '#home-balance');
  p.enthaelt('Meldung nennt die schwache Seite', txt, 'Rücken');
  p.enthaelt('Meldung nennt den Zeitraum', txt, '4 Wochen');
  p.enthaelt('Meldung sagt, was pro Woche zu tun ist', txt, '/ Woche');
  p.pruefe('Meldung führt zum Radar', await dawar(page, '#bal-mehr'));

  /* Die genannte Satzzahl muss das Verhältnis tatsächlich reparieren —
     sonst ist der Rat falsch, auch wenn er gut klingt. */
  const repariert = await js(page, `(() => {
    const b = balanceBefunde()[0];
    if (!b) return 'kein Befund';
    return (b.starkN / (b.schwachN + b.noetig)) <= 1.5;
  })()`);
  p.gleich('die empfohlene Satzzahl bringt das Verhältnis in den Rahmen', repariert, true);

  /* Die Meldung nennt eine WOCHEN-Zahl, gerechnet wird über vier Wochen.
     Werden die beiden verwechselt, steht dort das Vierfache — das sieht
     plausibel aus und ist trotzdem falsch. Deshalb beides gegeneinander. */
  const bezug = await js(page, `(() => {
    const b = balanceBefunde()[0];
    return { noetig: b.noetig, proWoche: b.proWoche, erwartet: Math.max(1, Math.ceil(b.noetig / 4)) };
  })()`);
  p.gleich('Wochenempfehlung ist aus der Fensterzahl umgerechnet', bezug.proWoche, bezug.erwartet);
  p.pruefe('Wochenempfehlung ist kleiner als die Fensterzahl', bezug.proWoche <= bezug.noetig,
           `${bezug.proWoche}/Woche aus ${bezug.noetig} in 4 Wochen`);
  p.enthaelt('Meldung schreibt die Wochenzahl, nicht die Fensterzahl',
             await text(page, '#home-balance'), `${bezug.proWoche} Sätze`);

  /* ── Nur der grösste Befund wird gezeigt ──────────────────────────── */
  await baue(page, { chest: 6, lats: 1, front_delt: 5, rear_delt: 0.5, quads: 6, hamstrings: 1 }, 12);
  await warte(page, 250);
  const viele = await befunde(page);
  p.mind('mehrere Ungleichgewichte werden erkannt', viele.length, 2);
  p.gleich('angezeigt wird nur eine Überschrift', await js(page, `document.querySelectorAll('#home-balance h3').length`), 1);
  p.enthaelt('auf weitere wird kompakt hingewiesen', await text(page, '#home-balance'), 'Statistik · +');
  p.pruefe('sortiert nach Schwere', viele[0].verhaeltnis >= viele[viele.length-1].verhaeltnis,
           viele.map(x => `${x.schwach} ${x.verhaeltnis.toFixed(1)}`).join(', '));

  /* ── Altes Training zählt nicht mehr ──────────────────────────────── */
  await baue(page, { chest: 6, lats: 1 }, 12, 40);   // Abstand 40 Tage → alles ausserhalb
  await warte(page, 250);
  p.gleich('Training ausserhalb der 4 Wochen meldet nicht', (await befunde(page)).length, 0);

  /* ── Leere Historie ───────────────────────────────────────────────── */
  await js(page, 'state.workouts = []; saveState(); renderHome();');
  await warte(page, 200);
  p.gleich('leere Historie meldet nicht', (await befunde(page)).length, 0);
  p.gleich('leere Historie zeichnet leeren Kasten', (await text(page, '#home-balance')).trim(), '');
};
