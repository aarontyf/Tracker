/* Systemtextgröße.

   Wer auf dem iPhone die Textgröße hochstellt, erwartet, dass Apps
   mitwachsen. Das passiert nur, wenn Schriftgrößen in `rem` stehen —
   eine Angabe in `px` ignoriert die Einstellung vollständig.

   Geprüft wird zweistufig:
     1. Wächst der Text überhaupt mit, wenn die Wurzelgröße steigt?
     2. Bleibt das Layout dabei heil, oder läuft es seitlich über?

   Punkt 2 ist der Grund, warum die Umstellung nicht einfach „px durch rem
   ersetzen" ist: Text, der wächst, braucht Platz, den er vorher nicht hatte. */

const { js, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Textgröße';

/* Repräsentative Textträger über alle Bildschirme — keine Vollerhebung,
   sondern die Stellen, an denen man eine ignorierte Einstellung merken würde. */
const PROBEN = [
  'h1', 'h2', 'h3',
  '.ttl', '.meta', '.tiny', '.badge',
  '.btn', '.chip', '.kpi b', '.kpi span',
  '.item', '.empty b',
];

const MESSE = `(() => {
  const proben = ${JSON.stringify(PROBEN)};
  const raus = {};
  for (const sel of proben) {
    const el = document.querySelector(sel);
    if (!el) continue;
    raus[sel] = parseFloat(getComputedStyle(el).fontSize);
  }
  return raus;
})()`;

/* Waagerechter Überlauf: Der Rumpf darf nie breiter scrollen als das
   Sichtfenster. Breite Einzelteile (Tabellen, Diagramme) dürfen es, wenn
   sie ihren eigenen Scrollbereich haben — deshalb wird body geprüft. */
const UEBERLAUF = `(() => {
  const b = document.body;
  const de = document.documentElement;
  return {
    bodyScroll: b.scrollWidth,
    fenster: de.clientWidth,
    ueber: Math.max(0, b.scrollWidth - de.clientWidth),
  };
})()`;

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 30 }));
  await warte(page, 300);

  const SCREENS = ['scr-home', 'scr-train', 'scr-hist', 'scr-lib', 'scr-stats'];

  /* ── 1. Wächst der Text mit? ──────────────────────────────────────── */
  await js(page, `showScreen('scr-lib')`);
  await warte(page, 250);

  const vorher = await js(page, MESSE);
  p.mind('genug Textproben gefunden', Object.keys(vorher).length, 6);

  /* Wurzelgröße verdoppeln — entspricht „Textgröße ganz gross" im System. */
  await js(page, `document.documentElement.style.fontSize = '32px'`);
  await warte(page, 250);
  const nachher = await js(page, MESSE);

  const gewachsen = [];
  const starr = [];
  for (const sel of Object.keys(vorher)) {
    const v = vorher[sel], n = nachher[sel];
    if (n > v * 1.3) gewachsen.push(`${sel} ${v}→${n}`);
    else starr.push(`${sel} ${v}px`);
  }

  const anteil = gewachsen.length / (gewachsen.length + starr.length);
  p.pruefe('Text wächst mit der Systemtextgröße',
           anteil >= 0.8,
           `${gewachsen.length} von ${gewachsen.length + starr.length} skalieren`);
  starr.slice(0, 12).forEach(s => p.pruefe(`  starr: ${s}`, false));

  /* ── 2. Bleibt das Layout bei grosser Schrift heil? ───────────────── */
  for (const s of SCREENS) {
    await js(page, `showScreen(${JSON.stringify(s)})`);
    await warte(page, 200);
    const u = await js(page, UEBERLAUF);
    p.hoechstens(`${s} läuft bei 200% Text nicht seitlich über`, u.ueber, 2);
  }

  /* Zurücksetzen, damit nachfolgende Prüfungen normal messen. */
  await js(page, `document.documentElement.style.fontSize = ''`);
  await warte(page, 200);

  /* ── 3. Auch bei kleiner Schrift darf nichts brechen ──────────────── */
  await js(page, `document.documentElement.style.fontSize = '12px'`);
  await warte(page, 250);
  for (const s of SCREENS) {
    await js(page, `showScreen(${JSON.stringify(s)})`);
    await warte(page, 150);
    const u = await js(page, UEBERLAUF);
    p.hoechstens(`${s} läuft bei 75% Text nicht über`, u.ueber, 2);
  }
  await js(page, `document.documentElement.style.fontSize = ''`);
};
