# Testsuite

Fährt die **ausgelieferte `index.html`** in echtem Chromium — kein Bauschritt,
keine Attrappen, keine zweite Kopie des Codes. Was hier grün ist, ist genau
das, was auch auf dem Handy landet.

## Einrichten

```bash
cd tests
npm install
npx playwright install chromium     # nur beim ersten Mal
```

Ist bereits ein Chromium auf dem Rechner, reicht auch:

```bash
CHROME_PATH=/pfad/zu/chrome npm test
```

## Ausführen

```bash
npm test                  # alle Suiten
npm run test:leise        # nur Fehler
node run.js a11y          # nur Suiten, deren Dateiname "a11y" enthält
node run.js listen daten  # mehrere
```

Rückgabewert ist `0`, wenn alles durchläuft, sonst `1` — damit lässt sich die
Suite unverändert in einen Git-Hook oder eine CI-Stufe hängen.

## Leistungsmessung

```bash
npm run bench                            # 200 Einheiten, CPU 4x gedrosselt
node bench.js --gegen ../alt/index.html  # zwei Stände vergleichen
THROTTLE=1 npm run bench                 # ungedrosselt
WORKOUTS=500 npm run bench               # grössere Historie
```

Gemessen wird der **Median** mehrerer Runden. Der Mittelwert taugt hier nicht:
ein einzelner GC-Lauf verzieht ihn um Dutzende Prozent, und dann sieht eine
Verbesserung wie ein Rückschritt aus. Die CPU wird gedrosselt, weil die App im
Studio auf einem Handy läuft und nicht auf einem Entwicklerrechner.

### Wie weit man den Zahlen trauen darf

**Den Bausteinen** (`getEx`, `filterEx`, `globalAgg`) weit — sie sind klein,
rein rechnend und schwanken kaum.

**Den ganzen Bildschirmen** deutlich weniger. Sie zeichnen ins DOM, stossen
Animationen an und hinterlassen einen Zustand, in dem die nächste Messung
läuft. Gemessen wurde hier einmal `renderTrain` mit **184 ms**, das in
Einzelmessung reproduzierbar **19 ms** braucht — Faktor 10, allein aus der
Reihenfolge der Messungen.

Zwei Regeln, die daraus folgen:

1. **Nie zwei getrennte Aufrufe vergleichen.** Absolute Zahlen schwankten
   zwischen zwei Läufen um mehr als das Anderthalbfache. Für den Vergleich
   zweier Stände `--gegen` benutzen — beide werden dann im selben Prozess
   nacheinander gemessen, und nur die Prozentspalte ist belastbar.
2. **Auffällige Einzelwerte nachmessen**, in einer eigenen kleinen Datei, die
   nur diesen einen Renderer in einer frischen Seite misst.

Die Zähler-Animation (`runCounters`) wird während der Messung stillgelegt: Sie
startet bei jedem Durchlauf neu, ohne dass die vorige fertig wäre, und bremst
nach zwölf Runden genau die Funktion aus, die gerade gemessen wird. Dass sie
existiert, ist kein Fehler — sie mitzumessen schon.

## Aufbau

```
run.js              Läufer — eine Suite, ein frischer Browser
bench.js            Leistungsmessung
lib/browser.js      Chromium finden, App laden, Kurzschreibweisen
lib/seed.js         Testdaten, deterministisch (gleicher Startwert = gleiche Daten)
lib/pruef.js        Prüfbaukasten (statt einer Testbibliothek)
suiten/*.js         Die eigentlichen Tests
```

Jede Suite bekommt einen **eigenen Browser mit frischem Profil**. Das kostet
ein paar Sekunden, verhindert aber, dass eine Suite die nächste über
`localStorage` oder ein offenes Modal beeinflusst — solche Fehler kosten
sonst Stunden.

## Eine Suite schreiben

```js
const { js, klick, tippe, warte } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'Mein Bereich';

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 30 }));
  p.gleich('zählt richtig', await js(page, 'state.workouts.length'), 30);
};
```

Datei unter `suiten/` ablegen — sie wird automatisch gefunden und ist über die
`.gitignore` bereits freigegeben.

Ein fehlgeschlagener Test bricht die Suite **nicht** ab. Sonst sieht man immer
nur den ersten Fehler und braucht fünf Durchläufe für fünf Befunde.

## Was geprüft wird

| Suite | Inhalt |
|---|---|
| `01-grundlagen` | Erststart, leeres Gerät, alle Bildschirme zeichnen sich |
| `02-listen` | Bibliothek, Verlauf, Picker — inklusive Klickpfade, weil die Listen delegiert arbeiten |
| `03-daten` | Speichern/Laden verlustfrei, Cache-Invalidierung, acht kaputte Zustandsformen |
| `04-a11y` | Zugängliche Namen, Trefferflächen, Sprache, Beschriftungen |
| `05-textgroesse` | Wächst der Text mit der Systemeinstellung, ohne dass das Layout überläuft |

`03-daten` ist die wichtigste: dort liegen die Trainingsdaten. Ein Fehler dort
ist nicht hässlich, sondern kostet Jahre an Historie.

## Hinweis zur `.gitignore`

Das Repo arbeitet mit einer **Freigabeliste** (erst alles sperren, dann
einzeln freigeben), weil der Ordner im Obsidian-Vault liegt und öffentlich auf
GitHub Pages ausgeliefert wird. Freigegeben sind nur `tests/*.js`,
`tests/lib/*.js`, `tests/suiten/*.js`, `package.json` und diese Datei.

Eine neue Notiz in `tests/` landet also **nicht** versehentlich im öffentlichen
Repo. Eine neue Suite in `tests/suiten/` dagegen schon — das ist so gewollt.
