/* ══════════════════════════════════════════════════════════════════════
   Winziger Prüfbaukasten.

   Bewusst keine Testbibliothek: die Suite soll mit einer einzigen
   Abhängigkeit (playwright-core) laufen und in fünf Minuten lesbar sein.

   Ein fehlgeschlagener Test bricht die Suite NICHT ab — sonst sieht man
   immer nur den ersten Fehler und braucht fünf Durchläufe für fünf Befunde.
   ══════════════════════════════════════════════════════════════════════ */

function pruefer(suiteName) {
  const treffer = [];

  const merke = (ok, name, info) => {
    treffer.push({ ok, name, info: info == null ? '' : String(info) });
    return ok;
  };

  return {
    suiteName,
    treffer,

    /* Grundform — alles andere ist Bequemlichkeit darüber. */
    pruefe: (name, bedingung, info) => merke(!!bedingung, name, info),

    gleich: (name, ist, soll) =>
      merke(Object.is(ist, soll), name, `erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`),

    ungleich: (name, ist, verboten) =>
      merke(!Object.is(ist, verboten), name, `sollte nicht ${JSON.stringify(verboten)} sein`),

    mind: (name, ist, min) =>
      merke(typeof ist === 'number' && ist >= min, name, `${ist} sollte >= ${min} sein`),

    hoechstens: (name, ist, max) =>
      merke(typeof ist === 'number' && ist <= max, name, `${ist} sollte <= ${max} sein`),

    zwischen: (name, ist, min, max) =>
      merke(typeof ist === 'number' && ist >= min && ist <= max, name, `${ist} sollte zwischen ${min} und ${max} liegen`),

    enthaelt: (name, heuhaufen, nadel) =>
      merke(String(heuhaufen).includes(nadel), name, `"${nadel}" fehlt in "${String(heuhaufen).slice(0, 120)}"`),

    /* Erwartet, dass ein Ausdruck IM Browser wirft — für Grenzfälle. */
    wirft: async (name, fn) => {
      try { await fn(); return merke(false, name, 'kein Fehler ausgelöst'); }
      catch (_) { return merke(true, name, ''); }
    },

    ergebnis() {
      const ok = treffer.filter(t => t.ok).length;
      return { suite: suiteName, ok, nok: treffer.length - ok, treffer };
    },
  };
}

module.exports = { pruefer };
