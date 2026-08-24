/* V79: Die zuvor getrennten V73- und V78-Linien müssen gemeinsam laufen.
   Diese Suite prüft die Nahtstellen und die faule zweite Statistik-Ebene. */

const { js, warte, text } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'V79 Zusammenführung';

exports.lauf = async ({ page, p }) => {
  await js(page, seedCode({ workouts: 300 }));

  const kern = await js(page, `(() => ({
    backup: typeof shareBackup === 'function',
    fokus: typeof statFokus === 'function',
    dauer: typeof wDauer === 'function',
    kardio: typeof wDauerSek === 'function' && EXDB.some(e=>e.art==='kardio'),
    ziele: !!document.querySelector('#modal-goal'),
    dips: EXDB.filter(e=>/dips/i.test(e.name) && exIsBW(e.id)).length
  }))()`);
  p.pruefe('Vollbackup aus der lokalen Linie ist erhalten', kern.backup);
  p.pruefe('Fokuskarte aus der lokalen Linie ist erhalten', kern.fokus);
  p.pruefe('echte Trainingsdauer aus der lokalen Linie ist erhalten', kern.dauer);
  p.pruefe('Kardio aus V78 ist erhalten', kern.kardio);
  p.pruefe('persönliche Ziele aus V78 sind erhalten', kern.ziele);
  p.mind('Dips werden aus V78 als Körpergewicht erkannt', kern.dips, 1);

  const geschlossen = await js(page, `(() => {
    statsPanel='all'; renderStats();
    const d=document.querySelector('#stats-all details[data-statsmore]');
    const body=d && d.querySelector('.statsmore-body');
    return {da:!!d, offen:!!(d&&d.open), fertig:!!(body&&body.dataset.fertig),
      monat:!!(body&&/Volumen pro Monat/.test(body.textContent)),
      karten:body?body.querySelectorAll('.card').length:-1};
  })()`);
  p.pruefe('weitere Statistiken bleiben erreichbar', geschlossen.da);
  p.gleich('zweite Statistik-Ebene startet geschlossen', geschlossen.offen, false);
  p.gleich('unsichtbare Statistik-Karten werden nicht vorab gebaut', geschlossen.fertig, false);
  p.pruefe('der Platzhalter nennt den enthaltenen Monatsverlauf', geschlossen.monat);
  p.gleich('vor dem Öffnen stehen dort null unsichtbare Karten', geschlossen.karten, 0);

  const offen = await js(page, `(() => {
    const d=document.querySelector('#stats-all details[data-statsmore]');
    d.open=true; d.dispatchEvent(new Event('toggle'));
    const body=d.querySelector('.statsmore-body');
    const html1=body.innerHTML;
    d.open=false; d.dispatchEvent(new Event('toggle'));
    d.open=true; d.dispatchEvent(new Event('toggle'));
    const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
    return {fertig:body.dataset.fertig, monat:/Volumen pro Monat/.test(body.textContent),
      karten:body.querySelectorAll('.card').length, einmal:html1===body.innerHTML,
      doppelt:ids.filter((id,i)=>id && ids.indexOf(id)!==i).length};
  })()`);
  p.gleich('beim Öffnen wird die zweite Ebene fertig markiert', offen.fertig, '1');
  p.pruefe('Monatsverlauf wird beim Öffnen wirklich gebaut', offen.monat);
  p.mind('alle Detailkarten werden beim Öffnen nachgeladen', offen.karten, 5);
  p.pruefe('erneutes Öffnen baut die Karten nicht doppelt', offen.einmal);
  p.gleich('auch nach dem Nachladen gibt es keine doppelten IDs', offen.doppelt, 0);

  await js(page, `showScreen('scr-settings')`).catch(()=>{});
  const version = await text(page, 'body');
  p.enthaelt('ausgelieferte Oberfläche trägt Version V82', version, 'Fitness Tracker V82');
};
