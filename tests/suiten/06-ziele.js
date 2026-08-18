/* Persönliche Ziele.

   Die Anzeige ist schnell geprüft. Interessant ist die Rechnung dahinter:
   Fortschritt gegen einen festgehaltenen Startwert, Zeitanteil, Prognose,
   und der Sonderfall Abnehmen — dort ist das Ziel KLEINER als der Start,
   und ein naiver Bruch würde negativen Fortschritt anzeigen. */

const { js, klick, dawar, text, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Ziele';

/* Legt ein Ziel direkt im Zustand an — am Formular vorbei, damit die
   Rechnung isoliert prüfbar ist. */
const setzeZiel = (page, g) => js(page, `(() => {
  state.goals = state.goals || [];
  const g = Object.assign({ id:'t'+Math.random().toString(36).slice(2), exId:null,
                            angelegt:new Date().toISOString().slice(0,10), erreicht:null }, ${JSON.stringify(g)});
  state.goals.push(g);
  saveState();
  return g.id;
})()`);

const stand = (page, id) => js(page, `(() => {
  const g = state.goals.find(x => x.id === ${JSON.stringify('__ID__')});
  return zielStand(g);
})()`.replace('__ID__', id));

const vorTagen = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const inTagen  = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 40 }));
  await js(page, 'state.settings.lastBackup = Date.now(); saveState(); closeModals();');
  await warte(page, 300);

  /* ── Leerzustand lädt zum Anlegen ein ─────────────────────────────── */
  await js(page, `state.goals = []; saveState(); renderHome();`);
  await warte(page, 250);
  p.enthaelt('Leerzustand erklärt sich', await text(page, '#home-goals'), 'Ziel');
  p.pruefe('Leerzustand bietet einen Knopf', await dawar(page, '#goal-new'));

  /* ── Fortschritt gegen den Startwert ──────────────────────────────── */
  const id1 = await setzeZiel(page, { art:'workouts', ziel:60, start:40, bis:inTagen(60), angelegt:vorTagen(30) });
  const s1 = await stand(page, id1);
  p.gleich('aktueller Wert kommt aus den echten Daten', s1.jetzt, 40);
  p.gleich('bei null Fortschritt ist der Anteil 0', s1.anteil, 0);
  p.gleich('noch nicht erreicht', s1.erreicht, false);
  p.zwischen('Zeitanteil nach 30 von 90 Tagen', s1.zeitAnteil, 0.3, 0.36);
  p.gleich('Restzeit stimmt', s1.tageRest, 60);

  /* Zehn Workouts weiter: 10 von 20 = die Hälfte. */
  await js(page, `(() => {
    const exId = EXDB[0].id;
    for (let i = 0; i < 10; i++) {
      state.workouts.push({ id:'z'+i, date:new Date().toISOString(), type:'Push',
        exercises:[{ exId, name:getEx(exId).name, sets:[{w:50,r:5,ts:Date.now()}] }],
        start:Date.now()-36e5, end:Date.now(), prs:[] });
    }
    saveState();
  })()`);
  const s2 = await stand(page, id1);
  p.gleich('Fortschritt zählt ab dem Startwert, nicht ab null', s2.anteil, 0.5);
  p.pruefe('bei 50% nach einem Drittel der Zeit: im Plan', s2.imPlan, `Anteil ${s2.anteil} vs Zeit ${s2.zeitAnteil.toFixed(2)}`);
  p.pruefe('Prognose wird gestellt', !!s2.prognose, s2.prognose);

  /* ── Erreichen ────────────────────────────────────────────────────── */
  await js(page, `(() => {
    const exId = EXDB[0].id;
    for (let i = 0; i < 10; i++) {
      state.workouts.push({ id:'y'+i, date:new Date().toISOString(), type:'Push',
        exercises:[{ exId, name:getEx(exId).name, sets:[{w:50,r:5,ts:Date.now()}] }],
        start:Date.now()-36e5, end:Date.now(), prs:[] });
    }
    saveState();
  })()`);
  const s3 = await stand(page, id1);
  p.gleich('Ziel erreicht', s3.erreicht, true);
  p.gleich('Anteil ist gedeckelt', s3.anteil, 1);
  p.gleich('keine Prognose mehr nötig', s3.prognose, null);

  p.pruefe('zielePruefen markiert das Ziel', await js(page, `(() => { zielePruefen(); return !!state.goals.find(g=>g.id===${JSON.stringify(id1)}).erreicht; })()`));
  p.gleich('zweiter Durchlauf feiert nicht erneut', await js(page, 'zielePruefen()'), false);

  /* ── Abnehmen: Ziel KLEINER als Start ─────────────────────────────── */
  await js(page, `state.goals = []; state.bodyweight = [{d:'${vorTagen(40)}', kg:85}]; saveState();`);
  const id2 = await setzeZiel(page, { art:'koerper', ziel:78, start:85, bis:inTagen(60), angelegt:vorTagen(30) });

  const ab0 = await stand(page, id2);
  p.gleich('am Start noch nichts geschafft', ab0.anteil, 0);
  p.gleich('abnehmen: noch nicht erreicht', ab0.erreicht, false);

  await js(page, `state.bodyweight.push({d:new Date().toISOString().slice(0,10), kg:81.5}); saveState();`);
  const ab1 = await stand(page, id2);
  p.gleich('abnehmen: halber Weg ergibt 50%', ab1.anteil, 0.5);
  p.gleich('abnehmen: noch nicht am Ziel', ab1.erreicht, false);

  await js(page, `state.bodyweight.push({d:new Date().toISOString().slice(0,10), kg:77.2}); saveState();`);
  const ab2 = await stand(page, id2);
  p.gleich('abnehmen: unter dem Zielwert gilt als erreicht', ab2.erreicht, true);
  p.gleich('abnehmen: Anteil gedeckelt', ab2.anteil, 1);

  /* Zunehmen darf dabei nicht als Fortschritt zählen. */
  await js(page, `state.bodyweight.push({d:new Date().toISOString().slice(0,10), kg:88}); saveState();`);
  const ab3 = await stand(page, id2);
  p.gleich('abnehmen: Rückschritt ergibt 0%, nicht negativ', ab3.anteil, 0);

  /* ── Abgelaufene Frist ────────────────────────────────────────────── */
  await js(page, `state.goals = []; saveState();`);
  const id3 = await setzeZiel(page, { art:'workouts', ziel:9999, start:0, bis:vorTagen(5), angelegt:vorTagen(60) });
  const ab = await stand(page, id3);
  p.pruefe('abgelaufene Frist wird erkannt', ab.abgelaufen, `${ab.tageRest} Tage`);
  p.hoechstens('abgelaufenes Ziel ist nicht erreicht', ab.erreicht ? 1 : 0, 0);

  /* ── Anzeige ──────────────────────────────────────────────────────── */
  await js(page, `state.goals = []; saveState();`);
  await setzeZiel(page, { art:'e1rm', exId:null, ziel:200, start:100, bis:inTagen(90), angelegt:vorTagen(10) });
  await js(page, `state.goals[0].exId = EXDB[0].id; saveState(); renderHome();`);
  await warte(page, 300);
  p.mind('Ziel erscheint auf der Startseite', await js(page, `document.querySelectorAll('#home-goals [data-goal]').length`), 1);
  p.pruefe('Fortschrittsbalken wird gezeichnet', await dawar(page, '#home-goals .gbar i'));

  /* Klick öffnet den Dialog zum Bearbeiten. */
  await klick(page, '#home-goals [data-goal]');
  await warte(page, 300);
  p.pruefe('Klick öffnet den Zieldialog', await js(page, `document.querySelector('#modal-goal').classList.contains('on')`));
  p.pruefe('Löschen ist beim Bearbeiten sichtbar', await js(page, `getComputedStyle(document.querySelector('#goal-del')).display !== 'none'`));
  await js(page, 'closeModals()');

  /* ── Beschädigte Ziele reissen die Startseite nicht mit ───────────── */
  await js(page, `state.goals = [null, {}, {art:'gibtsnicht',ziel:5}, {art:'workouts',ziel:'viel'},
                                  {art:'workouts',ziel:50,start:0,bis:'${inTagen(30)}',angelegt:'${vorTagen(1)}'}];
                  saveState();`);
  const heil = await js(page, `(() => { try { renderHome(); return true; } catch(e){ return String(e); } })()`);
  p.gleich('beschädigte Ziele legen die Startseite nicht lahm', heil, true);
  p.gleich('nur das gültige Ziel wird angezeigt', await js(page, `document.querySelectorAll('#home-goals [data-goal]').length`), 1);
};
