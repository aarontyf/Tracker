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

  /* Die Systemtextgröße wird über die STANDARDSCHRIFTGRÖSSE des Browsers
     gestellt, nicht über `html{font-size}`. Der Unterschied ist entscheidend:
     `html{font-size}` verändert nur die Grundlage von `rem`. Die echte
     iOS-Einstellung verändert die Standardgröße — und die wirkt zusätzlich
     auf Medienabfragen in `em`. Wer nur das eine simuliert, testet die
     Hälfte und übersieht genau die Regeln, die auf die andere reagieren. */
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const systemSchrift = px => cdp.send('Page.setFontSizes', { fontSizes: { standard: px } });

  /* ── 1. Wächst der Text mit? ──────────────────────────────────────── */
  await js(page, `showScreen('scr-lib')`);
  await warte(page, 250);

  const vorher = await js(page, MESSE);
  p.mind('genug Textproben gefunden', Object.keys(vorher).length, 6);

  await systemSchrift(32);                        // „Textgröße ganz gross"
  await warte(page, 300);
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

  /* ── 3. Auch bei kleiner Schrift darf nichts brechen ──────────────── */
  await systemSchrift(12);
  await warte(page, 300);
  for (const s of SCREENS) {
    await js(page, `showScreen(${JSON.stringify(s)})`);
    await warte(page, 150);
    const u = await js(page, UEBERLAUF);
    p.hoechstens(`${s} läuft bei 75% Text nicht über`, u.ueber, 2);
  }

  /* ── 4. Die Tableiste bleibt vollständig lesbar ───────────────────
     Sie ist fest positioniert und taucht deshalb im Überlaufmaß oben NICHT
     auf — bei 200 % war „Übungen" abgeschnitten, ohne dass ein Test anschlug.
     Hier wird direkt gemessen, ob eine Beschriftung breiter ist als ihr Knopf. */
  await systemSchrift(32);
  await warte(page, 300);
  const navAbgeschnitten = await js(page, `(() => {
    const raus = [];
    document.querySelectorAll('.nav button').forEach(b => {
      if (b.scrollWidth > b.clientWidth + 1) {
        raus.push((b.getAttribute('aria-label') || b.textContent).trim() +
                  ' (' + b.scrollWidth + ' in ' + b.clientWidth + ')');
      }
    });
    return raus;
  })()`);
  p.gleich('keine Tableisten-Beschriftung abgeschnitten', navAbgeschnitten.length, 0);
  navAbgeschnitten.forEach(n => p.pruefe('  abgeschnitten: ' + n, false));
  await systemSchrift(12);
  await warte(page, 250);

  /* ── 5. Eingabefelder bleiben bei 16px ────────────────────────────
     Unter 16 px zoomt iOS beim Antippen ins Feld und die Ansicht springt.
     Genau deshalb ist --fs-input als einziger Wert der Skala absolut —
     bei kleiner Systemschrift wäre er mit rem darunter gerutscht. */
  const eingabe = await js(page, `(() => {
    const el = document.querySelector('#lib-search') || document.querySelector('input[type=text]');
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  })()`);
  p.mind('Suchfeld bleibt bei kleiner Systemschrift >= 16px (sonst zoomt iOS)', eingabe, 16);

  await systemSchrift(16);                        // Standard wiederherstellen
};
