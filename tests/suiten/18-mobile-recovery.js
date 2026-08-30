/* V89: Ein beschädigter Offline-Cache muss sich selbst heilen können, ohne
   den lokalen Trainingsstand anzufassen. */

const fs = require('fs');
const path = require('path');

exports.name = 'V89 mobile Cache-Reparatur';

exports.lauf = async ({ p }) => {
  const root = path.join(__dirname, '..', '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const recovery = fs.readFileSync(path.join(root, 'recovery.html'), 'utf8');

  p.enthaelt('Service Worker nutzt einen neuen Cache', sw, "const VERSION = 'ft-v95'");
  p.enthaelt('neuer Worker übernimmt auch bei kaputtem Altstand sofort', sw, 'self.skipWaiting()');
  p.enthaelt('App-Hülle umgeht den fehleranfälligen HTTP-Cache', sw, "cache:'no-store'");
  p.enthaelt('App-Hülle wird vor dem Offline-Caching geprüft', sw, 'validShell(net)');
  p.enthaelt('Notfallseite löscht nur Cache Storage', recovery, 'caches.delete(key)');
  p.enthaelt('Notfallseite entfernt alte Service Worker', recovery, 'reg.unregister()');
  p.pruefe('Notfallseite löscht niemals localStorage', !/localStorage\.(?:clear|removeItem)/.test(recovery));
  p.enthaelt('Notfallseite verspricht Datenerhalt ausdrücklich', recovery, 'Deine Trainingsdaten bleiben erhalten');
};
