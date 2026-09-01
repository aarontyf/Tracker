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

  /* ── Tastaturbedienung von Modalen ────────────────────────────────
     Ab hier wieder aufgeräumt: die Prüfungen oben haben alles geöffnet. */
  await js(page, `document.querySelectorAll('.mback').forEach(m=>m.classList.remove('on'));
                  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('on'));
                  showScreen('scr-home');`);
  await warte(page, 200);

  /* Escape muss jedes Modal schliessen, nicht nur den Bestätigungsdialog. */
  await js(page, `openModal('#modal-calc')`);
  await warte(page, 200);
  p.pruefe('Modal öffnet sich', await js(page, `document.querySelector('#modal-calc').classList.contains('on')`));

  await page.keyboard.press('Escape');
  await warte(page, 200);
  p.pruefe('Escape schliesst das Modal',
           !(await js(page, `document.querySelector('#modal-calc').classList.contains('on')`)));

  /* Der Fokus muss dorthin zurück, wo er herkam — sonst landet man nach dem
     Schliessen wieder ganz oben in der Seite. */
  const zurueck = await js(page, `(() => {
    const anker = document.querySelector('#scr-home button') || document.querySelector('button');
    if (!anker) return 'kein Anker';
    anker.id = anker.id || 'a11y-anker';
    anker.focus();
    const vorher = document.activeElement.id;
    openModal('#modal-calc');
    return vorher;
  })()`);
  await warte(page, 250);
  await js(page, 'closeModals()');
  await warte(page, 200);
  p.gleich('Fokus kehrt nach dem Schliessen zurück', await js(page, 'document.activeElement.id'), zurueck);

  /* Ein offenes Modal muss den Fokus halten — sonst tabbt man unsichtbar
     durch die Seite dahinter. */
  await js(page, `openModal('#modal-calc')`);
  await warte(page, 250);
  const gefangen = await js(page, `(() => {
    const modal = document.querySelector('#modal-calc');
    const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
    if (items.length < 2) return 'zu wenig Ziele';
    items[items.length - 1].focus();
    return modal.contains(document.activeElement);
  })()`);
  await page.keyboard.press('Tab');
  await warte(page, 150);
  p.pruefe('Fokus bleibt im offenen Modal',
           await js(page, `document.querySelector('#modal-calc').contains(document.activeElement)`),
           'Ausgangslage: ' + gefangen);

  await js(page, 'closeModals()');

  /* Auch die echten Schließwege müssen den Fokus zurückgeben. Bis V99 galt
     das nur für closeModals(), nicht für X, Hintergrund oder Escape. */
  const xAnker = await js(page, `(() => {
    const anker=document.querySelector('#btn-settings'); anker.focus();
    openModal('#modal-settings'); return anker.id;
  })()`);
  await warte(page, 200);
  await page.click('#modal-settings [data-close]');
  await warte(page, 100);
  p.gleich('Schließen per X gibt den Fokus zurück', await js(page, 'document.activeElement.id'), xAnker);

  const escAnker = await js(page, `(() => {
    const anker=document.querySelector('#btn-ach'); anker.focus();
    openModal('#modal-ach'); return anker.id;
  })()`);
  await warte(page, 200);
  await page.keyboard.press('Escape');
  await warte(page, 100);
  p.gleich('Schließen per Escape gibt den Fokus zurück', await js(page, 'document.activeElement.id'), escAnker);

  const hintergrundAnker = await js(page, `(() => {
    const anker=document.querySelector('#btn-settings'); anker.focus();
    openModal('#modal-settings'); return anker.id;
  })()`);
  await warte(page, 200);
  await page.click('#modal-settings', {position:{x:2,y:2}});
  await warte(page, 100);
  p.gleich('Schließen über den Hintergrund gibt den Fokus zurück',
    await js(page, 'document.activeElement.id'), hintergrundAnker);

  const verschachtelt = await js(page, `(() => {
    const anker=document.querySelector('#btn-settings'); anker.focus();
    openModal('#modal-settings');
    const oeffner=document.querySelector('#sync-open'); oeffner.focus();
    openModal('#modal-sync');
    return {anker:anker.id,oeffner:oeffner.id};
  })()`);
  await warte(page, 200);
  await page.click('#modal-sync [data-close]');
  await warte(page, 100);
  p.gleich('verschachtelter Dialog kehrt zu seinem Öffner zurück',
    await js(page, 'document.activeElement.id'), verschachtelt.oeffner);
  await js(page, 'closeModals()');
  await warte(page, 100);
  p.gleich('danach kehrt der Hauptdialog zu seinem Öffner zurück',
    await js(page, 'document.activeElement.id'), verschachtelt.anker);
};
