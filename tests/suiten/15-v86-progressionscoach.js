/* V86: Fortschritt wird waehrend des Satzes, direkt nach dem Workout und
   als naechstes Ziel in der Statistik sichtbar — ohne Messwerte zu erfinden. */

const { js } = require('../lib/browser');

exports.name = 'V86 Progressionscoach';

exports.lauf = async ({ page, p }) => {
  const live = await js(page, `(() => {
    closeModals();
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)');
    const now=Date.now();
    state.workouts=[{id:'v86-alt',date:new Date(now-2*86400000).toISOString(),type:'Push',
      start:now-2*86400000,end:now-2*86400000+3600000,prs:[],
      exercises:[{exId:ex.id,name:ex.name,uni:false,sets:[
        {w:70,r:8},{w:70,r:7},{w:60,r:10,t:'d'}
      ]}]}];
    state.active={id:'v86-live',date:new Date(now).toISOString(),start:now,type:'Push',
      exercises:[{exId:ex.id,name:ex.name,__live:true,sets:[
        {w:30,r:8,t:'w'},{w:70,r:10},{w:70,r:''},{w:60,r:10,t:'d'}
      ]}]};
    saveState(); renderActive();
    const rows=[...document.querySelectorAll('#tw-exlist .setrow')];
    const feedback=[...document.querySelectorAll('#tw-exlist .setfeedback')];
    const vorwerte=rows.map(r=>{const b=r.querySelector('[data-pf]');return b?b.dataset.r||'':'';});
    const vorEingabe=state.active.exercises[0].sets[2].r;
    const zweite=rows[2].querySelector('[data-f=r]');
    zweite.value='8'; zweite.dispatchEvent(new Event('input',{bubbles:true}));
    return {
      warm:feedback[0].textContent.trim(), erster:feedback[1].textContent.trim(),
      zweiter:feedback[2].textContent.trim(), drop:feedback[3].textContent.trim(),
      vorwerte,vorEingabe, gespeichert:state.active.exercises[0].sets[2].r
    };
  })()`);

  p.gleich('Aufwärmsatz bekommt keinen irreführenden Leistungsvergleich',live.warm,'');
  p.enthaelt('erster Arbeitssatz zeigt den direkten Wiederholungsfortschritt',live.erster,'+2 Wdh');
  p.enthaelt('Live-Vergleich aktualisiert sich ohne Neuladen',live.zweiter,'+1 Wdh');
  p.enthaelt('Dropset wird mit dem letzten Dropset verglichen',live.drop,'Wie letztes Mal');
  p.gleich('Aufwärmen verschiebt den Vorwert von Arbeitssatz 1 nicht',live.vorwerte[1],'8');
  p.gleich('Aufwärmen verschiebt den Vorwert von Arbeitssatz 2 nicht',live.vorwerte[2],'7');
  p.gleich('die App erfindet vor der Eingabe keine geschafften Wiederholungen',live.vorEingabe,'');
  p.gleich('wirklich getippte Wiederholungen werden gespeichert',live.gespeichert,'8');

  const zeit = await js(page, `(() => {
    const ex=EXDB.find(e=>e.art==='zeit'); if(!ex) return null;
    const now=Date.now();
    state.workouts=[{id:'v86-zeit-alt',date:new Date(now-86400000).toISOString(),type:'Andere',prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{sek:45}]}]}];
    state.active={id:'v86-zeit',date:new Date(now).toISOString(),start:now,type:'Andere',
      exercises:[{exId:ex.id,name:ex.name,__live:true,sets:[{sek:55}]}]};
    saveState(); renderActive();
    return {name:ex.name,feedback:document.querySelector('.setfeedback').textContent,
      prog:!!document.querySelector('.progbox')};
  })()`);
  p.pruefe('eine Zeitübung ist für den Sonderfall vorhanden',!!zeit);
  if(zeit){
    p.enthaelt('Haltezeit wird in Sekunden statt Kilogramm verglichen',zeit.feedback,'+10 s');
    p.gleich('Zeitübungen erhalten keinen falschen kg-Progressionsvorschlag',zeit.prog,false);
  }

  const summary = await js(page, `(() => {
    closeModals();
    const exs=[
      EXDB.find(e=>e.name==='Bankdrücken (Langhantel)'),
      EXDB.find(e=>e.name==='Langhantelrudern (Obergriff)'),
      EXDB.find(e=>/Seitheben.*Kurzhantel/i.test(e.name)),
      EXDB.find(e=>e.name==='Klimmzüge')
    ];
    if(exs.some(x=>!x)) return {fehlt:true,namen:exs.map(x=>x&&x.name)};
    const now=Date.now(), altD=new Date(now-3*86400000).toISOString(), neuD=new Date(now).toISOString();
    const alt={id:'v86-report-alt',date:altD,type:'Ganzkörper',start:now-3*86400000,end:now-3*86400000+3600000,prs:[],
      exercises:[
        {exId:exs[0].id,name:exs[0].name,uni:false,sets:[{w:70,r:8}]},
        {exId:exs[1].id,name:exs[1].name,uni:false,sets:[{w:60,r:8}]},
        {exId:exs[2].id,name:exs[2].name,uni:false,sets:[{w:10,r:10}]}
      ]};
    const neu={id:'v86-report-neu',date:neuD,type:'Ganzkörper',start:now-3600000,end:now,durFix:3600000,prs:[],
      exercises:[
        {exId:exs[0].id,name:exs[0].name,uni:false,sets:[{w:70,r:10}]},
        {exId:exs[1].id,name:exs[1].name,uni:false,sets:[{w:60,r:8}]},
        {exId:exs[2].id,name:exs[2].name,uni:false,sets:[{w:10,r:8}]},
        {exId:exs[3].id,name:exs[3].name,uni:false,bw:true,bwkg:60,sets:[{w:5,r:6}]}
      ]};
    state.workouts=[alt,neu]; state.active=null; state.settings.favEx=[exs[0].id]; saveState();
    const report=workoutProgressReport(neu);
    showSummary(neu,[],0);
    const body=document.querySelector('#summary-body');
    const before={text:body.textContent,rows:body.querySelectorAll('[data-sum-ex]').length,
      counts:Object.fromEntries(['up','same','down','new'].map(k=>[k,report.filter(x=>x.status===k).length])),
      next:body.querySelector('.progressrow .next')?.textContent||'',hit:Math.round(body.querySelector('.progressrow').getBoundingClientRect().height)};
    body.querySelector('[data-sum-ex="'+exs[0].id+'"]').click();
    return {...before,stat:exStatId,panel:statsPanel};
  })()`);

  p.pruefe('alle benötigten Übungen für den Bericht sind vorhanden',!summary.fehlt,summary.namen);
  if(!summary.fehlt){
    p.enthaelt('Zusammenfassung enthält einen Fortschrittsbericht',summary.text,'Fortschrittsbericht');
    p.gleich('Bericht erkennt eine Verbesserung',summary.counts.up,1);
    p.gleich('Bericht erkennt eine gehaltene Leistung',summary.counts.same,1);
    p.gleich('Bericht benennt einen niedrigeren Bestsatz neutral',summary.counts.down,1);
    p.gleich('neue Übung bekommt einen Ausgangswert statt erfundenem Vergleich',summary.counts.new,1);
    p.gleich('jede Übung führt aus dem Bericht in ihre Analyse',summary.rows,4);
    p.enthaelt('Bericht nennt bereits das nächste konkrete Ziel',summary.next,'Nächstes Ziel');
    p.mind('Berichtszeilen haben ein handytaugliches Touchziel',summary.hit,44);
    p.gleich('Direktsprung öffnet den Übungsreiter',summary.panel,'ex');
  }

  const stats = await js(page, `(() => {
    closeModals();
    const ex=EXDB.find(e=>e.name==='Bankdrücken (Langhantel)');
    const zeit=EXDB.find(e=>e.art==='zeit');
    const now=Date.now();
    state.exOpt={[ex.id]:{lo:6,hi:8,step:2.5,sets:3}};
    state.settings.favEx=[ex.id];
    state.workouts=Array.from({length:4},(_,i)=>({id:'v86-ziel-'+i,
      date:new Date(now-(4-i)*86400000).toISOString(),type:'Push',prs:[],
      exercises:[{exId:ex.id,name:ex.name,uni:false,sets:Array.from({length:3},()=>({w:70,r:8}))}]
        .concat(i===3&&zeit?[{exId:zeit.id,name:zeit.name,sets:[{sek:60}]}]:[])}));
    state.active=null; saveState(); statsPanel='overview'; renderStats();
    const box=document.querySelector('#stats-overview');
    const card=[...box.querySelectorAll('.card')].find(x=>/Nächste Ziele/.test(x.textContent));
    const row=card&&card.querySelector('[data-stat-ex]');
    return {text:card?card.textContent:'',row:!!row,id:row&&row.dataset.statEx,
      hit:row?Math.round(row.getBoundingClientRect().height):0,
      zeit:zeit?zeit.name:null,html:card?card.innerHTML:''};
  })()`);

  p.enthaelt('Statistik bündelt die nächsten Progressionsziele',stats.text,'Nächste Ziele');
  p.enthaelt('fertige Doppelprogression wird als Lastsprung erkannt',stats.text,'Gewicht rauf');
  p.enthaelt('Plateau-Hinweis bleibt neben dem Lastsprung sichtbar',stats.text,'3 Einheiten ohne Bestwert');
  p.enthaelt('Karte erklärt, dass nichts als geschafft erfunden wird',stats.text,'nie als geschafft');
  p.pruefe('Ziel führt direkt zur passenden Übungsanalyse',stats.row);
  p.mind('Zielzeile hat ein handytaugliches Touchziel',stats.hit,44);
  if(stats.zeit) p.pruefe('Zeitübungen tauchen nicht mit falschem kg-Ziel auf',!stats.text.includes(stats.zeit));
};
