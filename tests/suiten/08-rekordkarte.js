/* Rekord-Karte als Bild.

   Ein Canvas lässt sich nicht „ansehen" wie ein DOM-Knoten — ein Fehler
   beim Zeichnen erzeugt kein leeres Element, sondern ein makellos schwarzes
   Bild. Das sieht in keinem Test verdächtig aus. Deshalb wird hier direkt
   in die Pixel geschaut: Steht überhaupt etwas drauf, und steht es dort,
   wo es hingehört. */

const { js, dawar, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Rekordkarte';

/* Zählt Pixel, die sich vom Hintergrund abheben — in einem waagerechten
   Streifen der Karte. So lässt sich prüfen, ob eine bestimmte Zeile
   (Überschrift, Wert, Fusszeile) tatsächlich gezeichnet wurde. */
const streifen = (page, pr, vonAnteil, bisAnteil) => js(page, `(() => {
  const c = zeichnePrKarte(${JSON.stringify(pr)});
  const x = c.getContext('2d');
  const y0 = Math.floor(c.height * ${vonAnteil});
  const y1 = Math.floor(c.height * ${bisAnteil});
  const d = x.getImageData(0, y0, c.width, y1 - y0).data;
  let hell = 0;
  for (let i = 0; i < d.length; i += 4) {
    /* Der Lichtschein oben ist bläulich und dunkel — Text ist deutlich
       heller. Die Schwelle trennt Schrift von Verlauf. */
    if (d[i] + d[i+1] + d[i+2] > 240) hell++;
  }
  return { hell, gesamt: (y1 - y0) * c.width };
})()`);

const PR = { name:'Bankdrücken (Langhantel)', kind:'e1RM', val:'142 kg', old:'138 kg',
             date:new Date().toISOString() };

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 20 }));
  await js(page, 'state.settings.lastBackup = Date.now(); saveState(); closeModals();');
  await warte(page, 250);

  /* ── Grundform ────────────────────────────────────────────────────── */
  const masse = await js(page, `(() => {
    const c = zeichnePrKarte(${JSON.stringify(PR)});
    return { b: c.width, h: c.height, tag: c.tagName };
  })()`);
  p.gleich('Karte ist ein Canvas', masse.tag, 'CANVAS');
  p.gleich('Breite stimmt', masse.b, 1080);
  p.gleich('Höhe stimmt', masse.h, 1350);
  p.pruefe('Seitenverhältnis ist 4:5', Math.abs(masse.b / masse.h - 0.8) < 0.001);

  /* ── Es steht wirklich etwas drauf ────────────────────────────────── */
  const kopf = await streifen(page, PR, 0.07, 0.13);
  p.mind('Kopfzeile ist gezeichnet', kopf.hell, 500);

  const wert = await streifen(page, PR, 0.30, 0.50);
  p.mind('der grosse Wert ist gezeichnet', wert.hell, 3000);

  const fuss = await streifen(page, PR, 0.85, 0.98);
  p.mind('Fusszeile mit Marke ist gezeichnet', fuss.hell, 500);

  /* Der Wert muss der auffälligste Teil sein — dafür ist die Karte da. */
  p.pruefe('der Wert ist die grösste Fläche', wert.hell > kopf.hell && wert.hell > fuss.hell,
           `Kopf ${kopf.hell}, Wert ${wert.hell}, Fuss ${fuss.hell}`);

  /* ── Der Vorher-Wert ist optional ─────────────────────────────────── */
  const ohneAlt = await js(page, `(() => {
    const c = zeichnePrKarte(${JSON.stringify({ ...PR, old: null })});
    return !!c;
  })()`);
  p.gleich('Karte ohne Vorher-Wert lässt sich zeichnen', ohneAlt, true);

  /* ── Lange Übungsnamen dürfen nicht überlaufen ────────────────────── */
  const langer = 'Schrägbank-Brustpresse einarmig an der Multipresse (Maschine)';
  const rand = await js(page, `(() => {
    const c = zeichnePrKarte(${JSON.stringify({ ...PR, name: langer })});
    const x = c.getContext('2d');
    /* Linker und rechter Rand müssen frei bleiben, sonst ist der Name
       aus dem Bild gelaufen. */
    const pruefeSpalte = sx => {
      const d = x.getImageData(sx, 0, 8, c.height).data;
      let hell = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]+d[i+1]+d[i+2] > 240) hell++;
      return hell;
    };
    return { links: pruefeSpalte(2), rechts: pruefeSpalte(c.width - 10) };
  })()`.replace('langer', JSON.stringify(langer)));
  p.gleich('langer Name läuft links nicht heraus', rand.links, 0);
  p.gleich('langer Name läuft rechts nicht heraus', rand.rechts, 0);

  /* ── Unvollständige Daten dürfen nicht werfen ─────────────────────── */
  for(const [name, pr] of Object.entries({
    'leeres Objekt': {},
    'ohne Namen': { kind:'Gewicht', val:'100 kg' },
    'ohne Wert': { name:'Kniebeuge' },
    'null-Felder': { name:null, kind:null, val:null, old:null, date:null },
    'Zahl statt Text': { name:42, kind:7, val:99, date:Date.now() },
  })){
    const ok = await js(page, `(() => { try { return !!zeichnePrKarte(${JSON.stringify(pr)}); } catch(e){ return String(e); } })()`);
    p.gleich(`zeichnet trotz ${name}`, ok, true);
  }

  /* ── PNG entsteht wirklich ────────────────────────────────────────── */
  const blob = await js(page, `(async () => {
    const c = zeichnePrKarte(${JSON.stringify(PR)});
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    return b ? { typ: b.type, groesse: b.size } : null;
  })()`);
  p.pruefe('PNG wird erzeugt', !!blob);
  if(blob){
    p.gleich('Dateityp ist PNG', blob.typ, 'image/png');
    p.mind('PNG ist nicht leer', blob.groesse, 5000);
  }

  /* ── Anbindung auf der Startseite ─────────────────────────────────── */
  await js(page, `(() => {
    const w = state.workouts[state.workouts.length - 1];
    w.prs = [{ exId:w.exercises[0].exId, name:w.exercises[0].name, kind:'e1RM', val:'142 kg', old:'138 kg' }];
    w.date = new Date().toISOString();
    saveState(); renderHome();
  })()`);
  await warte(page, 300);
  p.pruefe('Bestleistung hat einen Teilen-Knopf', await dawar(page, '#home-records [data-prshare]'));
  p.pruefe('Teilen-Knopf ist beschriftet',
           await js(page, `!!document.querySelector('#home-records [data-prshare]').getAttribute('aria-label')`));

  /* Klick darf nichts werfen — der Teilen-Dialog selbst ist im Test nicht
     verfügbar, der Weg dorthin schon. */
  const geklickt = await js(page, `(async () => {
    try {
      const urspruenglich = navigator.canShare;
      navigator.canShare = () => false;          // Download-Zweig erzwingen
      await teilePrKarte(_letzteRekorde[0]);
      navigator.canShare = urspruenglich;
      return true;
    } catch(e){ return String(e); }
  })()`);
  p.gleich('Teilen läuft bis zur Rückfallebene durch', geklickt, true);
};
