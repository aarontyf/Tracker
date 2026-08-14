/* Barrierefreiheit.

   Zwei Dinge, die sich verlässlich automatisch prüfen lassen:
   ein zugänglicher Name für jeden Knopf, und Fingerkuppen-taugliche
   Trefferflächen. Beides sind harte Kriterien, keine Geschmacksfragen —
   ein Knopf ohne Namen wird von VoiceOver als „Schaltfläche" vorgelesen,
   und ein 24-px-Ziel trifft man im Studio mit schwitzigen Händen nicht. */

const { js, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Barrierefreiheit';

/* Alles öffnen, was sonst versteckt bleibt — ein Knopf in einem Modal ist
   genauso Teil der Oberfläche wie einer auf der Startseite. */
const ALLES_SICHTBAR = `(() => {
  document.querySelectorAll('.mback').forEach(m => m.classList.add('on'));
  document.querySelectorAll('.screen').forEach(s => s.classList.add('on'));
  return document.querySelectorAll('button').length;
})()`;

/* Ein Knopf gilt als benannt, wenn ihn ein Screenreader vorlesen kann:
   sichtbarer Text, aria-label, aria-labelledby oder title. */
const OHNE_NAMEN = `(() => {
  const raus = [];
  document.querySelectorAll('button, [role="button"]').forEach(b => {
    const text = (b.textContent || '').replace(/\\s+/g, '').trim();
    const label = b.getAttribute('aria-label');
    const von = b.getAttribute('aria-labelledby');
    const titel = b.getAttribute('title');
    const benannt = text.length > 0 || (label && label.trim()) || von || (titel && titel.trim());
    if (!benannt) {
      raus.push({
        id: b.id || null,
        klasse: b.className || null,
        daten: Object.keys(b.dataset || {}).join(','),
        html: b.outerHTML.slice(0, 110),
      });
    }
  });
  return raus;
})()`;

/* Trefferflächen. 44x44 CSS-Pixel ist die Apple-Vorgabe, WCAG 2.2 nennt 24x24
   als Minimum. Gemessen wird die tatsächliche Fläche inklusive Polsterung. */
const ZU_KLEIN = `(() => {
  const raus = [];
  document.querySelectorAll('button, [role="button"], a[href]').forEach(b => {
    const r = b.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;            // unsichtbar, zählt nicht
    if (getComputedStyle(b).display === 'none') return;
    if (r.width < 24 || r.height < 24) {
      raus.push({
        name: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30),
        klasse: b.className,
        groesse: Math.round(r.width) + 'x' + Math.round(r.height),
      });
    }
  });
  return raus;
})()`;

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 30 }));
  await warte(page, 300);

  const knoepfe = await js(page, ALLES_SICHTBAR);
  await warte(page, 300);
  p.mind('Oberfläche hat Knöpfe zum Prüfen', knoepfe, 30);

  /* ── Zugänglicher Name ────────────────────────────────────────────── */
  const stumm = await js(page, OHNE_NAMEN);
  p.gleich('jeder Knopf hat einen zugänglichen Namen', stumm.length, 0);
  stumm.slice(0, 15).forEach(b =>
    p.pruefe(`  stumm: ${b.id || b.klasse || b.daten || '?'} — ${b.html}`, false));

  /* ── Trefferflächen ───────────────────────────────────────────────── */
  const klein = await js(page, ZU_KLEIN);
  p.gleich('keine Trefferfläche unter 24x24', klein.length, 0);
  klein.slice(0, 15).forEach(b =>
    p.pruefe(`  zu klein: ${b.name || b.klasse} (${b.groesse})`, false));

  /* ── Sprache und Titel ────────────────────────────────────────────── */
  p.gleich('Dokumentsprache ist gesetzt', await js(page, `document.documentElement.lang`), 'de');
  p.mind('Dokument hat einen Titel', (await js(page, 'document.title')).length, 3);

  /* ── Bedeutungstragende Grafiken ──────────────────────────────────── */
  const svgOhne = await js(page, `(() => {
    let n = 0;
    document.querySelectorAll('svg[role="img"]').forEach(s => {
      if (!s.getAttribute('aria-label') && !s.querySelector('title')) n++;
    });
    return n;
  })()`);
  p.gleich('jede als Bild ausgezeichnete Grafik hat eine Beschreibung', svgOhne, 0);

  /* ── Eingabefelder ────────────────────────────────────────────────── */
  const felderOhne = await js(page, `(() => {
    const raus = [];
    document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach(f => {
      const label = f.getAttribute('aria-label')
                 || f.getAttribute('placeholder')
                 || (f.id && document.querySelector('label[for="' + f.id + '"]'));
      if (!label) raus.push(f.id || f.className || f.outerHTML.slice(0, 70));
    });
    return raus;
  })()`);
  p.gleich('jedes Eingabefeld ist beschriftet', felderOhne.length, 0);
  felderOhne.slice(0, 10).forEach(f => p.pruefe(`  unbeschriftet: ${f}`, false));
};
