/* ══════════════════════════════════════════════════════════════════════
   Browser-Anbindung für die Testsuite.

   Die App ist eine einzelne HTML-Datei ohne Bauschritt — entsprechend wird
   sie hier direkt über file:// geladen. Kein Server, keine Bundler-Stufe,
   dieselbe Datei, die auch auf dem Handy landet.
   ══════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const APP = path.resolve(__dirname, '..', '..', 'index.html');

/* Chromium finden, ohne einen festen Pfad ins Repo zu schreiben.
   Reihenfolge: ausdrücklich gesetzt → Playwright-Ablage → System. */
function findeChromium() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const ablage = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (ablage && fs.existsSync(ablage)) {
    const kandidaten = fs.readdirSync(ablage)
      .filter(n => n.startsWith('chromium-'))
      .sort()
      .reverse()
      .flatMap(n => [
        path.join(ablage, n, 'chrome-linux', 'chrome'),
        path.join(ablage, n, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        path.join(ablage, n, 'chrome-win', 'chrome.exe'),
      ]);
    const treffer = kandidaten.find(p => fs.existsSync(p));
    if (treffer) return treffer;
  }

  const system = [
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  const treffer = system.find(p => fs.existsSync(p));
  if (treffer) return treffer;

  throw new Error(
    'Kein Chromium gefunden. Setze CHROME_PATH auf eine Chrome-/Chromium-Binärdatei\n' +
    'oder installiere einen Browser über "npx playwright install chromium".'
  );
}

/* Öffnet die App in einem frischen Profil.
   opts.throttle  — CPU-Drosselung (4 ≈ Mittelklasse-Handy)
   opts.viewport  — Standard ist iPhone-Format
   opts.schriftPx — Basis-Schriftgröße des Browsers, für die rem-Tests */
async function appOeffnen(opts = {}) {
  const browser = await chromium.launch({
    executablePath: findeChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage({
    viewport: opts.viewport || { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  /* Jeder Fehler auf der Seite ist ein Testfehler — auch wenn er nichts
     sichtbar kaputt macht. Fehlende Icons/Manifest bei file:// zählen nicht. */
  const fehler = [];
  const harmlos = /ERR_FILE_NOT_FOUND|favicon|manifest|sw\.js|ServiceWorker|Failed to load resource/i;
  page.on('pageerror', e => fehler.push(String(e && e.stack || e)));
  page.on('console', m => {
    if (m.type() === 'error' && !harmlos.test(m.text())) fehler.push('console: ' + m.text());
  });

  if (opts.schriftPx) {
    const cdp0 = await page.context().newCDPSession(page);
    await cdp0.send('Page.enable');
    await cdp0.send('Page.setFontSizes', { fontSizes: { standard: opts.schriftPx } });
  }

  /* opts.datei erlaubt es, einen anderen Stand zu laden — etwa den vorigen
     Commit, um eine optische Änderung gegen den Vorzustand zu halten. */
  await page.goto('file://' + (opts.datei || APP), { waitUntil: 'load' });
  await page.waitForFunction('typeof state === "object" && typeof renderAll === "function"', null, { timeout: 15000 });

  if (opts.throttle) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
  }

  return {
    browser,
    page,
    fehler,
    close: () => browser.close(),
  };
}

/* PIN-Sperre und Onboarding wegräumen. Beide sind eigene Testfälle —
   in allen anderen Suiten stünden sie nur im Weg. */
async function overlaysSchliessen(page) {
  await page.evaluate(`(() => {
    document.querySelectorAll('#lock, .mback.on').forEach(el => el.classList.remove('on'));
    if (typeof closeModals === 'function') closeModals();
    document.body.style.overflow = '';
  })()`);
}

/* Kurzschreibweisen — machen die Suiten lesbar. */
const js     = (page, ausdruck) => page.evaluate(ausdruck);
const zaehle = (page, sel) => page.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const text   = (page, sel) => page.evaluate(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent || ''`);
const dawar  = (page, sel) => page.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`);
const klick  = (page, sel) => page.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) throw new Error('Element nicht gefunden: ' + ${JSON.stringify(sel)});
  el.click();
})()`);

/* Text in ein Feld schreiben und das input-Ereignis auslösen — die App
   hängt ihre Suchen daran, ein blosses value= würde nichts anstossen. */
const tippe = (page, sel, wert) => page.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) throw new Error('Feld nicht gefunden: ' + ${JSON.stringify(sel)});
  el.value = ${JSON.stringify(wert)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()`);

const warte = (page, ms) => page.waitForTimeout(ms);

/* Die Suchfelder sind mit 120 ms entprellt — danach noch etwas Luft. */
const warteAufSuche = page => page.waitForTimeout(220);

module.exports = {
  APP, appOeffnen, overlaysSchliessen, findeChromium,
  js, zaehle, text, dawar, klick, tippe, warte, warteAufSuche,
};
