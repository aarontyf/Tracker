/* Körpergewichtsübungen: Dips, Klimmzüge, Liegestütze.

   Bei ihnen ist der Körper die Last. Steht kein Gewicht zur Verfügung,
   rechnet die App sie mit 0 kg — und dann zählt ein Satz Dips genau so viel
   wie gar kein Training. Das ist kein Anzeigefehler: Volumen, Rekorde und
   die gesamte Statistik hängen daran. */

const { js, warte } = require('../lib/browser');

exports.name = 'Körpergewicht';

/* Baut eine Historie aus genau einer Übung, damit die Erwartungswerte
   von Hand nachrechenbar bleiben. */
const bau = (page, exName, saetze) => js(page, `(() => {
  const ex = EXDB.find(e => e.name === ${JSON.stringify(exName)});
  if (!ex) return 'Übung nicht gefunden: ' + ${JSON.stringify(exName)};
  const jetzt = Date.now();
  state.workouts = [{
    id:'bw-1', date:new Date(jetzt).toISOString(), type:'Push',
    start:jetzt-36e5, end:jetzt, prs:[],
    exercises:[{ exId:ex.id, name:ex.name, sets:${JSON.stringify(saetze)} }]
  }];
  state.settings.lastBackup = Date.now();
  saveState(); closeModals();
  const w = state.workouts[0];
  return { exId:ex.id, eq:ex.eq, vol: wVolume(w) };
})()`);

exports.lauf = async ({ page, p }) => {

  /* ── Die Einstufung stimmt ────────────────────────────────────────── */
  const einstufung = await js(page, `(() => {
    const namen = ['Dips (Brust-Fokus)','Dips (Trizeps, Barren)','Klimmzüge (Obergriff)','Liegestütze'];
    const raus = {};
    namen.forEach(n => {
      const ex = EXDB.find(e => e.name === n);
      if (ex) raus[n] = { eq: ex.eq, bw: exIsBW(ex.id), assist: exIsAssist(ex.id) };
    });
    const am = EXDB.find(e => e.name === 'Dips (Maschine, unterstützt)');
    if (am) raus['Dips (Maschine, unterstützt)'] = { eq: am.eq, bw: exIsBW(am.id), assist: exIsAssist(am.id) };
    return raus;
  })()`);
  p.pruefe('Dips zählen als Körpergewichtsübung', einstufung['Dips (Brust-Fokus)'].bw,
           einstufung['Dips (Brust-Fokus)'].eq);
  p.pruefe('Trizeps-Dips ebenfalls', einstufung['Dips (Trizeps, Barren)'].bw);
  p.pruefe('unterstützte Dips zählen als Maschine mit Hilfe',
           einstufung['Dips (Maschine, unterstützt)'].assist);

  /* ── Der Kern: ohne Wiegeeintrag darf nicht 0 herauskommen ─────────
     Das Onboarding fragt nach dem Gewicht. Wer es dort angegeben, sich aber
     nie unter „Körpergewicht" eingetragen hat, hatte bis V78 bei jedem Dip
     ein Volumen von null. */
  await js(page, `state.bodyweight = []; state.profile = { done:true, gewicht:80 }; saveState();`);
  const ohneWiegen = await bau(page, 'Dips (Brust-Fokus)', [{ w:'', r:10 }, { w:'', r:8 }]);
  p.gleich('ohne Wiegeeintrag zählt das Profilgewicht', ohneWiegen.vol, 80 * 18);
  p.ungleich('Volumen ist nicht null', ohneWiegen.vol, 0);

  p.gleich('bwAt greift auf das Profil zurück',
           await js(page, `bwAt(new Date().toISOString())`), 80);

  /* Ein echter Wiegeeintrag hat Vorrang vor dem Profil. */
  await js(page, `state.bodyweight = [{ d:new Date().toISOString().slice(0,10), kg:86 }]; saveState();`);
  const mitWiegen = await bau(page, 'Dips (Brust-Fokus)', [{ w:'', r:10 }, { w:'', r:8 }]);
  p.gleich('ein Wiegeeintrag hat Vorrang', mitWiegen.vol, 86 * 18);

  /* Zusatzgewicht kommt oben drauf. */
  const mitZusatz = await bau(page, 'Dips (Brust-Fokus)', [{ w:20, r:5 }]);
  p.gleich('Zusatzgewicht kommt zum Körpergewicht dazu', mitZusatz.vol, (86 + 20) * 5);

  /* Ohne beides bleibt null — aber dann gibt es auch nichts zu rechnen. */
  await js(page, `state.bodyweight = []; state.profile = null; saveState();`);
  const garnichts = await bau(page, 'Dips (Brust-Fokus)', [{ w:'', r:10 }]);
  p.gleich('ganz ohne Angabe bleibt es bei null', garnichts.vol, 0);

  /* ── Unterstützte Maschine: Körpergewicht minus Hilfe ──────────────
     Ohne Körpergewicht wäre die effektive Last max(0, 0 − Hilfe) = 0 —
     dieselbe Wurzel, dieselbe Folge. */
  await js(page, `state.bodyweight = []; state.profile = { done:true, gewicht:80 }; saveState();`);
  const assist = await bau(page, 'Dips (Maschine, unterstützt)', [{ w:20, r:10 }]);
  p.gleich('unterstützte Dips rechnen Körpergewicht minus Hilfe', assist.vol, (80 - 20) * 10);

  const vielHilfe = await bau(page, 'Dips (Maschine, unterstützt)', [{ w:200, r:5 }]);
  p.gleich('mehr Hilfe als Körpergewicht ergibt nicht negativ', vielHilfe.vol, 0);

  /* ── Rekorde und Verlauf hängen an derselben Zahl ──────────────────── */
  await js(page, `state.bodyweight = []; state.profile = { done:true, gewicht:80 }; saveState();`);
  await bau(page, 'Klimmzüge (Obergriff)', [{ w:'', r:12 }]);
  const bests = await js(page, `(() => {
    const ex = EXDB.find(e => e.name === 'Klimmzüge (Obergriff)');
    const b = exBests(ex.id);
    return b ? { maxW:b.maxW, maxE:b.maxE, maxReps:b.maxReps } : null;
  })()`);
  p.pruefe('Klimmzüge haben eine Historie', !!bests);

  /* ── Altdaten behalten ihr mitgeschriebenes Gewicht ─────────────────
     Beim Abschliessen wird bwkg im Eintrag festgehalten. Es muss Vorrang
     haben, sonst wandert das Volumen alter Einheiten mit dem heutigen
     Gewicht mit — und die Historie waere nicht mehr die Historie. */
  const alt = await js(page, `(() => {
    const ex = EXDB.find(e => e.name === 'Dips (Brust-Fokus)');
    const jetzt = Date.now();
    state.bodyweight = [{ d:new Date().toISOString().slice(0,10), kg:95 }];
    state.workouts = [{
      id:'alt-1', date:new Date(jetzt - 400*864e5).toISOString(), type:'Push',
      start:jetzt, end:jetzt, prs:[],
      exercises:[{ exId:ex.id, name:ex.name, bw:true, bwkg:70, sets:[{ w:0, r:10 }] }]
    }];
    saveState();
    return wVolume(state.workouts[0]);
  })()`);
  p.gleich('altes Workout rechnet mit dem damals notierten Gewicht', alt, 70 * 10);
};
