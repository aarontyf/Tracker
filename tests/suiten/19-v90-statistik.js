/* V90: Vorab geloggte Einheiten dürfen keine Statistik vorwegnehmen.
   Außerdem prüft diese Suite den neuen Rhythmusblock und die korrekte
   Darstellung historischer Körpergewichts-/Assistenzsätze. */

const { js } = require('../lib/browser');
const { seedCode } = require('../lib/seed');

exports.name = 'V90 Statistik-Wahrheit und Rhythmus';

exports.lauf = async ({ page, p }) => {
  const zukunft = await js(page, `(() => {
    const alt=EXDB.find(e=>!istZeitArt(exArt(e.id)) && !exIsBW(e.id) && !exIsAssist(e.id));
    const neu=EXDB.find(e=>e.id!==alt.id && !istZeitArt(exArt(e.id)) && !exIsBW(e.id) && !exIsAssist(e.id));
    const mach=(id,ex,tag,rpe)=>({id,date:workoutDatumFuerTag(tag),type:'Push',start:Date.now()-36e5,end:Date.now(),rpe,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:50,r:8,ts:Date.now()-30*60000},{w:55,r:6,ts:Date.now()}]}]});
    state.workouts=[mach('heute',alt,heuteIso(),7),mach('morgen',neu,tagPlus(heuteIso(),1),10)];
    saveState();
    statsPanel='overview'; renderStats();
    const overview={text:document.querySelector('#stats-overview').textContent, n:lastStatsWs.length};
    statsPanel='all'; renderStats();
    const gesamt={text:document.querySelector('#stats-all').textContent, n:lastStatsWs.length};
    const heat=yearHeatmap(new Date().getFullYear());
    const freq=haeufigkeit(10);
    return {overview,gesamt,heat,freq,alt:alt.name,neu:neu.name,
      agg:globalAgg().wk,monat:workoutsIn([new Date(new Date().getFullYear(),new Date().getMonth(),1),new Date(new Date().getFullYear(),new Date().getMonth()+1,1)]).length};
  })()`);
  p.gleich('Übersicht zählt ein vorab geloggtes Workout nicht', zukunft.overview.n, 1);
  p.gleich('Gesamtstatistik zählt ein vorab geloggtes Workout nicht', zukunft.gesamt.n, 1);
  p.gleich('globale Aggregation zählt nur stattgefundene Workouts', zukunft.agg, 1);
  p.pruefe('zukünftige Übung fehlt in der Häufigkeitsliste', !zukunft.freq.some(x=>x.name===zukunft.neu));
  p.pruefe('heutige Übung bleibt in der Häufigkeitsliste', zukunft.freq.some(x=>x.name===zukunft.alt));
  p.enthaelt('Kalender zählt nur den echten Trainingstag', zukunft.heat, '1 Trainingstage');
  p.enthaelt('Kalender erklärt die Helligkeit korrekt', zukunft.heat, 'heller = mehr Sätze');

  await js(page, seedCode({ workouts: 60 }));
  const rhythmus = await js(page, `(() => {
    statsPanel='overview'; renderStats();
    const box=document.querySelector('#stats-overview');
    const text=box.textContent;
    const panels=['overview','week','month','year','all'].map(panel=>{
      statsPanel=panel; renderStats();
      const el=document.querySelector('#stats-'+panel);
      return {panel,bad:/NaN|Infinity|undefined/.test(el.textContent),html:el.innerHTML.length};
    });
    const ids=[...document.querySelectorAll('[id]')].map(x=>x.id).filter(Boolean);
    return {text,panels,doppelt:ids.filter((id,i)=>ids.indexOf(id)!==i).length};
  })()`);
  p.enthaelt('Übersicht enthält den neuen Rhythmusblock', rhythmus.text, 'Zyklustreue');
  p.enthaelt('Rhythmus zeigt Vollständigkeit', rhythmus.text, 'vollständig');
  p.enthaelt('Rhythmus zeigt Einheiten statt Monats-Workoutzahl', rhythmus.text, 'Ø Einheiten/Zyklus');
  p.enthaelt('Übersicht zeigt die vier Einheiten einzeln', rhythmus.text, 'Einheiten pro Zyklus');
  p.pruefe('alte 30-Tage-Workoutkennzahl ist überschrieben', !rhythmus.text.includes('Workouts/30 Tage'));
  rhythmus.panels.forEach(x=>{
    p.pruefe(`${x.panel} rendert Inhalt`, x.html>100);
    p.pruefe(`${x.panel} enthält keine kaputte Kennzahl`, !x.bad);
  });
  p.gleich('Statistik erzeugt keine doppelten IDs', rhythmus.doppelt, 0);

  const satzText = await js(page, `(() => {
    const bwEx=EXDB.find(e=>exIsBW(e.id) && !exIsAssist(e.id) && !istZeitArt(exArt(e.id)));
    const asEx=EXDB.find(e=>exIsAssist(e.id));
    const tag1=tagPlus(heuteIso(),-3), tag2=tagPlus(heuteIso(),-2), tag3=tagPlus(heuteIso(),-1);
    const w=(id,tag,e)=>({id,date:workoutDatumFuerTag(tag),type:'Pull',start:Date.now()-36e5,end:Date.now(),prs:[],exercises:[e]});
    state.bodyweight=[{d:tag1,kg:60}];
    state.workouts=[
      w('bw0',tag1,{exId:bwEx.id,name:bwEx.name,bw:true,bwkg:60,uni:false,sets:[{w:0,r:10}]}),
      w('bw1',tag2,{exId:bwEx.id,name:bwEx.name,bw:true,bwkg:60,uni:false,sets:[{w:10,r:5}]}),
      w('as1',tag3,{exId:asEx.id,name:asEx.name,as:true,bwkg:60,uni:false,sets:[{w:20,r:8}]})
    ];
    saveState();
    exStatId=bwEx.id; renderExStats(); const bw=document.querySelector('#exstat-detail').textContent;
    exStatId=asEx.id; renderExStats(); const assist=document.querySelector('#exstat-detail').textContent;
    return {bw,assist};
  })()`);
  p.enthaelt('Körpergewichtssatz wird verständlich benannt', satzText.bw, 'Körpergewicht × 10');
  p.enthaelt('Zusatzgewicht wird mit Plus dargestellt', satzText.bw, '+10 kg × 5');
  p.enthaelt('Assistenzsatz zeigt effektive statt eingegebener Hilfe', satzText.assist, '40 kg effektiv × 8');
};
