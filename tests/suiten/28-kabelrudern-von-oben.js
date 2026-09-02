/* V100 Patch: Kabelrudern von oben bei etwa 45 Grad ist eine eigene
   Übung und darf nicht mit High Rows an der Maschine vermischt werden. */

const { js } = require('../lib/browser');

exports.name = 'Kabelrudern von oben (45°)';

exports.lauf = async ({ page, p }) => {
  const datenbank = await js(page, `(() => {
    const id='x-kabelrudern-von-oben-45';
    const treffer=EXDB.filter(e=>e.id===id);
    const ex=treffer[0];
    const how=HOWTO[id];
    const findet=q=>filterEx(q,'Alle').some(e=>e.id===id);
    return {
      anzahl:treffer.length,
      id:ex&&ex.id,
      name:ex&&ex.name,
      gruppe:ex&&ex.grp,
      geraet:ex&&ex.eq,
      primaer:ex&&ex.p,
      sekundaer:ex&&ex.s,
      art:ex&&ex.art,
      einseitig:ex&&ex.uni,
      deutsch:findet('kabelrudern von oben'),
      winkel:findet('45 grad'),
      englisch:findet('high cable row'),
      kurz:findet('high row kabel'),
      ruecken:filterEx('45 grad','Rücken').some(e=>e.id===id),
      amEnde:EXDB_ALL[EXDB_ALL.length-1].id===id,
      maschineGetrennt:EXDB.some(e=>e.id==='x-rudern-von-oben-maschine'),
      schritte:how&&how.s.length,
      fehler:how&&how.e.length
    };
  })()`);

  p.gleich('Übung existiert genau einmal', datenbank.anzahl, 1);
  p.gleich('stabile Übungs-ID ist korrekt', datenbank.id, 'x-kabelrudern-von-oben-45');
  p.gleich('sichtbarer Name ist korrekt', datenbank.name, 'Kabelrudern von oben (45°)');
  p.gleich('Übung ist dem Rücken zugeordnet', datenbank.gruppe, 'Rücken');
  p.gleich('Gerät ist Kabel', datenbank.geraet, 'Kabel');
  p.gleich('Lat und oberer Rücken sind direkte Zielmuskeln', datenbank.primaer.join(','), 'lats,upper_back');
  p.gleich('hintere Schulter und Bizeps unterstützen', datenbank.sekundaer.join(','), 'rear_delt,biceps');
  p.gleich('Übung nutzt Gewicht und Wiederholungen', datenbank.art, 'kraft');
  p.gleich('Übung ist standardmäßig beidarmig', datenbank.einseitig, false);
  p.pruefe('deutscher Name findet die Übung', datenbank.deutsch);
  p.pruefe('Winkelsuche findet die Übung', datenbank.winkel);
  p.pruefe('englische Suche findet die Übung', datenbank.englisch);
  p.pruefe('High-Row-Kurzsuche findet die Übung', datenbank.kurz);
  p.pruefe('Rückenfilter enthält die Übung', datenbank.ruecken);
  p.pruefe('Anfügen am Ende schützt alle alten Übungspositionen', datenbank.amEnde);
  p.pruefe('Maschinen-High-Row bleibt eine getrennte Übung', datenbank.maschineGetrennt);
  p.mind('Technikansicht enthält vier klare Schritte', datenbank.schritte, 4);
  p.mind('Technikansicht nennt typische Fehler', datenbank.fehler, 3);

  const wege = await js(page, `(() => {
    const id='x-kabelrudern-von-oben-45', ex=getEx(id), now=Date.now();
    const eintrag={exId:id,name:ex.name,uni:false,sets:[{w:40,r:10},{w:40,r:8}]};
    state.workouts=[{id:'high-row-log',date:new Date(now-3600000).toISOString(),
      start:now-7200000,end:now-3600000,type:'Pull',variant:'A',prs:[],
      exercises:[eintrag]}];
    state.active={id:'high-row-live',date:new Date(now).toISOString(),start:now,
      type:'Pull',variant:'B',exercises:[{exId:id,name:ex.name,__live:true,sets:[{w:42.5,r:8}]}]};
    saveState(); renderActive();
    const liveText=document.querySelector('#tw-exlist').textContent;
    state.active=null; saveState();

    libGrp='Rücken'; document.querySelector('#lib-search').value='45 grad'; renderLib();
    const inBibliothek=!!document.querySelector('#lib-list [data-lib="'+id+'"]');

    exStatId=id; document.querySelector('#exstat-search').value=''; renderExStats();
    const statText=document.querySelector('#exstat-detail').textContent;
    const muskeln=muscleSetsBy(state.workouts,'direct');
    const historie=exHistory(id);
    return {
      abrufbar:!!ex,
      live:liveText.includes(ex.name),
      bibliothek:inBibliothek,
      statistik:statText.includes(ex.name),
      historie:historie.length,
      volumen:wVolume(state.workouts[0]),
      saetze:wSets(state.workouts[0]),
      lats:muskeln.lats||0,
      upperBack:muskeln.upper_back||0
    };
  })()`);

  p.pruefe('getEx liefert die Übung stabil aus', wege.abrufbar);
  p.pruefe('Übung erscheint im laufenden Training', wege.live);
  p.pruefe('Übung erscheint in der Bibliothek', wege.bibliothek);
  p.pruefe('Übung erscheint in ihrer Statistik', wege.statistik);
  p.gleich('Historie erkennt das protokollierte Training', wege.historie, 1);
  p.gleich('Volumen wird korrekt berechnet', wege.volumen, 720);
  p.gleich('Satzzahl wird korrekt berechnet', wege.saetze, 2);
  p.gleich('beide Sätze zählen direkt zum Lat', wege.lats, 2);
  p.gleich('beide Sätze zählen direkt zum oberen Rücken', wege.upperBack, 2);
};
