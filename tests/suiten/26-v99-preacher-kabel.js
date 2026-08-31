/* V99: Der Kabel-Preacher-Curl muss in allen generischen Übungswegen
   funktionieren, ohne die positionsbasierten IDs alter Daten zu verschieben. */

const { js } = require('../lib/browser');

exports.name = 'V99 Preacher Curl am Kabel';

exports.lauf = async ({ page, p }) => {
  const datenbank = await js(page, `(() => {
    const id='x-preacher-curl-am-kabel';
    const treffer=EXDB.filter(e=>e.id===id);
    const ex=treffer[0];
    const how=HOWTO[id];
    const findet=q=>filterEx(q,'Alle').some(e=>e.id===id);
    return {
      anzahl:treffer.length,
      id:ex&&ex.id, name:ex&&ex.name, gruppe:ex&&ex.grp, geraet:ex&&ex.eq,
      primaer:ex&&ex.p, sekundaer:ex&&ex.s, art:ex&&ex.art, einseitig:ex&&ex.uni,
      deutsch:findet('preacher kabel'), exakt:findet('preacher curl am kabel'),
      englisch:findet('cable preacher'), scott:findet('scott curl kabelzug'),
      arme:filterEx('preacher kabel','Arme').some(e=>e.id===id),
      amEnde:EXDB_ALL[EXDB_ALL.length-1].id===id,
      schritte:how&&how.s.length, fehler:how&&how.e.length
    };
  })()`);

  p.gleich('Übung existiert genau einmal', datenbank.anzahl, 1);
  p.gleich('stabile Übungs-ID ist korrekt', datenbank.id, 'x-preacher-curl-am-kabel');
  p.gleich('sichtbarer Name ist korrekt', datenbank.name, 'Preacher Curl am Kabel');
  p.gleich('Übung ist der Gruppe Arme zugeordnet', datenbank.gruppe, 'Arme');
  p.gleich('Gerät ist Kabel', datenbank.geraet, 'Kabel');
  p.gleich('Bizeps ist der einzige direkte Zielmuskel', datenbank.primaer.join(','), 'biceps');
  p.gleich('keine Hilfsmuskeln werden erfunden', datenbank.sekundaer.length, 0);
  p.gleich('Übung nutzt Gewicht und Wiederholungen', datenbank.art, 'kraft');
  p.gleich('Übung ist standardmäßig beidarmig', datenbank.einseitig, false);
  p.pruefe('deutsche Kurzsuche findet die Übung', datenbank.deutsch);
  p.pruefe('voller deutscher Name findet die Übung', datenbank.exakt);
  p.pruefe('englische Suche findet die Übung', datenbank.englisch);
  p.pruefe('Scott-Curl-Synonyme finden die Übung', datenbank.scott);
  p.pruefe('Arme-Filter enthält die Übung', datenbank.arme);
  p.pruefe('Anfügen am Ende schützt alle alten eNN-Positionen', datenbank.amEnde);
  p.mind('Technikansicht enthält vier klare Schritte', datenbank.schritte, 4);
  p.mind('Technikansicht nennt typische Fehler', datenbank.fehler, 3);

  const wege = await js(page, `(() => {
    const id='x-preacher-curl-am-kabel', ex=getEx(id), now=Date.now();
    const eintrag={exId:id,name:ex.name,uni:false,sets:[{w:20,r:10},{w:20,r:9}]};
    state.workouts=[{id:'v99-log',date:new Date(now-3600000).toISOString(),
      start:now-7200000,end:now-3600000,type:'Pull',variant:'A',prs:[],
      exercises:[eintrag]}];
    state.active={id:'v99-live',date:new Date(now).toISOString(),start:now,
      type:'Pull',variant:'B',exercises:[{exId:id,name:ex.name,__live:true,sets:[{w:22.5,r:8}]}]};
    saveState(); renderActive();
    const liveText=document.querySelector('#tw-exlist').textContent;
    state.active=null; saveState();

    libGrp='Arme'; document.querySelector('#lib-search').value='preacher kabel'; renderLib();
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
      bizeps:muskeln.biceps||0,
      roh:JSON.stringify(state.workouts[0].exercises[0].sets)
    };
  })()`);

  p.pruefe('getEx liefert die Übung stabil aus', wege.abrufbar);
  p.pruefe('Übung erscheint im laufenden Training', wege.live);
  p.pruefe('Übung erscheint in der Bibliothek', wege.bibliothek);
  p.pruefe('Übung erscheint in ihrer Statistik', wege.statistik);
  p.gleich('Historie erkennt das protokollierte Training', wege.historie, 1);
  p.gleich('Volumen wird ohne Doppelzählung berechnet', wege.volumen, 380);
  p.gleich('Satzzahl wird ohne Doppelzählung berechnet', wege.saetze, 2);
  p.gleich('beide Sätze zählen direkt zum Bizeps', wege.bizeps, 2);
  p.gleich('Statistik verändert die gespeicherten Sätze nicht', wege.roh,
    JSON.stringify([{w:20,r:10},{w:20,r:9}]));
};
