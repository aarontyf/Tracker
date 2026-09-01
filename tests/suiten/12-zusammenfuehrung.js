/* V84: Die zuvor getrennten V73- und V78-Linien müssen gemeinsam laufen.
   Diese Suite prüft außerdem die mobile Übersicht und die faule zweite
   Statistik-Ebene. */

const { js, warte, text } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'V84 Zusammenführung';

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

  /* V84: Die wichtigsten Antworten stehen in einer eigenen mobilen
     Übersicht; die sechs vollständigen Reiternamen dürfen nicht mehr in
     einer gequetschten Segmentleiste enden. */
  const overview = await js(page, `(() => {
    statsPanel='overview'; renderStats();
    const tabs=[...document.querySelectorAll('#stats-seg button')];
    const box=document.querySelector('#stats-overview');
    return {tabs:tabs.map(x=>x.textContent.replace(/\\s+/g,' ').trim()),aktiv:tabs.filter(x=>x.classList.contains('on')).map(x=>x.dataset.p),
      scroll:document.querySelector('#stats-seg').classList.contains('scroll'),
      sichtbar:getComputedStyle(box).display!=='none', text:box.textContent,
      karten:box.querySelectorAll('.card').length, exAction:!!box.querySelector('[data-stat-ex]'),
      doppelt:[...document.querySelectorAll('[id]')].map(x=>x.id).filter((id,i,a)=>id&&a.indexOf(id)!==i).length};
  })()`);
  p.gleich('Statistik hat sechs klar benannte Bereiche',overview.tabs.join('|'),'Übersicht|Zyklus|5 Zyklen|20 Zyklen|Gesamt|Übung');
  p.gleich('Übersicht ist der aktive Startbereich',overview.aktiv.join('|'),'overview');
  p.pruefe('Statistik-Tabs sind auf dem Handy horizontal scrollbar',overview.scroll);
  p.pruefe('Übersicht wird sichtbar gezeichnet',overview.sichtbar);
  p.mind('Übersicht bündelt mehrere kompakte Karten',overview.karten,5);
  p.pruefe('Übersicht enthält den Zyklus-Leistungstrend',/Leistungstrend/.test(overview.text));
  p.pruefe('Übersicht enthält Muskelgruppen',/Muskelgruppen/.test(overview.text));
  p.pruefe('Übersicht enthält Kraftentwicklung',/Kraftentwicklung/.test(overview.text));
  p.pruefe('Übersicht enthält Körpergewicht',/Körpergewicht/.test(overview.text));
  p.pruefe('Kraftzeilen führen direkt zur Übungsanalyse',overview.exAction);
  p.gleich('neue Übersicht erzeugt keine doppelten IDs',overview.doppelt,0);

  const sprung = await js(page, `(() => {
    const b=document.querySelector('#stats-overview [data-stat-ex]');
    if(!b) return null; const id=b.dataset.statEx; b.click();
    return {id,stat:exStatId,panel:statsPanel,aktiv:document.querySelector('#stats-seg .on').dataset.p};
  })()`);
  p.pruefe('Direktsprung in die Übungsanalyse ist vorhanden',!!sprung);
  if(sprung){
    p.gleich('Direktsprung übernimmt die richtige Übung',sprung.stat,sprung.id);
    p.gleich('Direktsprung aktiviert den Übungsreiter',sprung.panel,'ex');
    p.gleich('aktive Tab-Markierung folgt dem Direktsprung',sprung.aktiv,'ex');
  }

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
  p.pruefe('der kompakte Platzhalter lädt noch keine Monatsdaten', !geschlossen.monat);
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
  p.enthaelt('ausgelieferte Oberfläche trägt Version V100', version, 'Fitness Tracker V100');
};
