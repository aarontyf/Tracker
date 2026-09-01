/* V100: App-Informationen haben einen klaren eigenen Platz. Die Urheberangabe
   bleibt dezent, Updates und Datenschutz verschwinden aber nicht. */

const { js } = require('../lib/browser');

exports.name = 'V100 App-Info und Einstellungen';

exports.lauf = async ({ page, p }) => {
  const info = await js(page, `(() => {
    const modal=document.querySelector('#modal-settings');
    const gruppe=document.querySelector('#settings-app');
    const backup=[...modal.querySelectorAll('.settings-group')]
      .find(x=>x.querySelector('summary').textContent.includes('Backup & Daten'));
    const titel=document.querySelector('#settings-title');
    const name=document.querySelector('label[for="set-name"]');
    return {
      dialogLabel:modal.querySelector('.modal').getAttribute('aria-labelledby'),
      titel:titel&&titel.textContent.trim(),
      nameLabel:name&&name.textContent.trim(),
      version:gruppe&&gruppe.textContent.includes('Fitness Tracker V100'),
      credit:gruppe&&gruppe.textContent.includes('Entwickelt von Aaron Jeetun'),
      updateInApp:!!(gruppe&&gruppe.querySelector('#btn-checkupd')),
      reloadInApp:!!(gruppe&&gruppe.querySelector('#btn-hardreload')),
      privacyInApp:!!(gruppe&&gruppe.textContent.includes('Kein Tracking')),
      runtime:!!(gruppe&&gruppe.querySelector('#app-runtime')),
      connectivity:!!(gruppe&&gruppe.querySelector('#app-connectivity')),
      updateInBackup:!!(backup&&backup.querySelector('#btn-checkupd')),
      doppelteIds:[...modal.querySelectorAll('[id]')]
        .map(x=>x.id).filter((id,i,a)=>a.indexOf(id)!==i)
    };
  })()`);

  p.gleich('Einstellungsdialog ist über seine Überschrift beschriftet', info.dialogLabel, 'settings-title');
  p.gleich('Überschrift ist kurz und eindeutig', info.titel, 'Einstellungen');
  p.gleich('Namensfeld hat ein echtes Label', info.nameLabel, 'Dein Name');
  p.pruefe('V100 steht im App-Bereich', info.version);
  p.pruefe('Aaron Jeetun ist als Entwickler genannt', info.credit);
  p.pruefe('Update-Prüfung liegt im App-Bereich', info.updateInApp);
  p.pruefe('sicheres Neuladen liegt im App-Bereich', info.reloadInApp);
  p.pruefe('Datenschutzstatus liegt im App-Bereich', info.privacyInApp);
  p.pruefe('App-Bereich zeigt Browser- oder Installationsstatus', info.runtime);
  p.pruefe('App-Bereich zeigt Online- oder Offline-Status', info.connectivity);
  p.gleich('Backup-Bereich enthält keine App-Updates mehr', info.updateInBackup, false);
  p.gleich('Einstellungen enthalten keine doppelten IDs', info.doppelteIds.length, 0);

  const touch = await js(page, `(() => {
    const gruppe=document.querySelector('#settings-app');
    gruppe.open=true;
    const summary=gruppe.querySelector('summary').getBoundingClientRect();
    const buttons=[...gruppe.querySelectorAll('button')].map(x=>Math.round(x.getBoundingClientRect().height));
    return {offen:gruppe.open, summary:Math.round(summary.height), buttons};
  })()`);
  p.pruefe('App-Bereich lässt sich öffnen', touch.offen);
  p.mind('App-Aufklapper bleibt ein großes Touch-Ziel', touch.summary, 44);
  p.pruefe('Update-Aktionen bleiben gut antippbar', touch.buttons.every(x=>x>=36), touch.buttons.join(','));

  const accordion = await js(page, `(() => {
    const gruppen=[...document.querySelectorAll('#modal-settings .settings-group')];
    gruppen[0].open=true; gruppen[0].dispatchEvent(new Event('toggle'));
    gruppen[3].open=true; gruppen[3].dispatchEvent(new Event('toggle'));
    return gruppen.map(x=>x.open);
  })()`);
  p.gleich('nur ein Einstellungsbereich bleibt gleichzeitig offen',
    accordion.filter(Boolean).length, 1);
  p.gleich('der zuletzt geöffnete Bereich bleibt sichtbar', accordion[3], true);
};
