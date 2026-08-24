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
    const namen = ['Dips (Brust-Fokus)','Dips (Trizeps, Barren)','Klimmzüge','Liegestütze'];
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
  await bau(page, 'Klimmzüge', [{ w:'', r:12 }]);
  const bests = await js(page, `(() => {
    const ex = EXDB.find(e => e.name === 'Klimmzüge');
    const b = exBests(ex.id);
    return b ? { maxW:b.maxW, maxE:b.maxE, maxReps:b.maxReps } : null;
  })()`);
  p.pruefe('Klimmzüge haben eine Historie', !!bests);

  /* ── Normale und gewichtete Klimmzüge sind eine Übung ─────────────── */
  const fusion = await js(page, `(() => {
    const jetzt=Date.now(), altNeutral='x-klimmzüge-neutraler-griff',
          altWeighted='x-klimmzüge-mit-gewicht', ziel='x-klimmzüge';
    state.profile={done:true,gewicht:60}; state.bodyweight=[];
    state.workouts=[
      {id:'pull-1',date:new Date(jetzt-864e5).toISOString(),type:'Pull',start:jetzt,end:jetzt,prs:[],
       exercises:[{exId:altNeutral,name:'Klimmzüge (neutraler Griff)',sets:[{w:0,r:10}]}]},
      {id:'pull-2',date:new Date(jetzt).toISOString(),type:'Pull',start:jetzt,end:jetzt,prs:[],
       exercises:[{exId:altWeighted,name:'Klimmzüge (mit Gewicht)',sets:[{w:10,r:5}]}]}
    ];
    state.templates=[{id:'t',name:'Pull',type:'Pull',exIds:[altNeutral,altWeighted]}];
    state.goals=[{id:'g',art:'gewicht',exId:altWeighted,ziel:20}];
    state.exOpt={[altNeutral]:{lo:5,hi:8},[ziel]:{step:2.5}};
    migrateState(); saveState();
    const h=exHistory(ziel), b=exBests(ziel);
    return {
      sichtbar:EXDB.filter(e=>['Klimmzüge','Klimmzüge (mit Gewicht)','Klimmzüge (neutraler Griff)'].includes(e.name)).map(e=>e.name),
      ids:state.workouts.map(w=>w.exercises[0].exId), namen:state.workouts.map(w=>w.exercises[0].name),
      vols:h.map(x=>x.vol), sessions:b.sessions, maxW:b.maxW,
      tpl:state.templates[0].exIds, goal:state.goals[0].exId,
      opt:state.exOpt[ziel]
    };
  })()`);
  p.gleich('nur eine allgemeine Klimmzug-Übung ist sichtbar', fusion.sichtbar.join('|'), 'Klimmzüge');
  p.gleich('normale und gewichtete Historie nutzen dieselbe ID', new Set(fusion.ids).size, 1);
  p.gleich('beide Historieneinträge heißen Klimmzüge', new Set(fusion.namen).size, 1);
  p.gleich('Körpergewichts-Volumen bleibt erhalten', fusion.vols[0], 60*10);
  p.gleich('Zusatzgewicht bleibt im Volumen erhalten', fusion.vols[1], (60+10)*5);
  p.gleich('beide Einheiten erscheinen in einer Statistik', fusion.sessions, 2);
  p.gleich('Bestwert ist das Zusatzgewicht', fusion.maxW, 10);
  p.gleich('Vorlage enthält Klimmzüge nur einmal', fusion.tpl.join('|'), 'x-klimmzüge');
  p.gleich('Ziel wird mit umgezogen', fusion.goal, 'x-klimmzüge');
  p.gleich('kanonische Einstellung gewinnt ohne Altwerte zu verlieren', JSON.stringify(fusion.opt), JSON.stringify({lo:5,hi:8,step:2.5}));

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
