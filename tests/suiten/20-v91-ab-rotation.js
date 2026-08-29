/* V91: Der Plan ist ein echter Sechs-Tage-Zyklus. A/B muss gespeichert,
   projiziert und statistisch getrennt werden, ohne Legacy-Daten zu brechen. */

const { js } = require('../lib/browser');

exports.name = 'V91 Push/Pull A-B-Rotation';

exports.lauf = async ({ page, p }) => {
  const folge = await js(page, `(() => {
    let s={type:'Push',variant:'A'}, labels=[];
    for(let i=0;i<7;i++){ labels.push(einheitLabel(s)); s=naechsterSchritt(s); }
    return {labels,soll:CYCLE_SOLL_TAGE,min:CYCLE_MIN_TAGE,max:CYCLE_MAX_TAGE};
  })()`);
  p.gleich('Rotation hat beide Rest-Tage', folge.labels.join(' → '),
    'Push A → Pull A → Rest → Push B → Pull B → Rest → Push A');
  p.gleich('Solldauer ist sechs Tage', folge.soll, 6);
  p.pruefe('Toleranz liegt um den Sechs-Tage-Zyklus', folge.min < 6 && folge.max > 6);

  const zyklen = await js(page, `(() => {
    const ex=EXDB.find(e=>!istZeitArt(exArt(e.id)));
    const start=tagPlus(heuteIso(),-12);
    const w=(id,off,type,variant)=>({id,date:workoutDatumFuerTag(tagPlus(start,off)),type,variant,prs:[],
      exercises:[{exId:ex.id,name:ex.name,sets:[{w:40,r:8}]}]});
    state.workouts=[
      w('pa',0,'Push','A'),w('la',1,'Pull','A'),w('pb',3,'Push','B'),w('lb',4,'Pull','B'),
      w('pa2',6,'Push','A'),w('la2',7,'Pull','A')
    ];
    saveState();
    const cs=cycles();
    return cs.map(c=>({n:c.n,tage:c.tage,voll:c.vollstaendig,fehlt:c.fehlt,ids:c.ws.map(w=>w.id)}));
  })()`);
  p.gleich('Push B startet keinen neuen Zyklus', zyklen[0].ids.join(','), 'pa,la,pb,lb');
  p.gleich('der nächste Push A startet Zyklus 2', zyklen[1].ids.join(','), 'pa2,la2');
  p.pruefe('vollständiger A/B-Zyklus wird erkannt', zyklen[0].voll);
  p.gleich('unvollständiger Zyklus nennt exakt B-Lücken', zyklen[1].fehlt.join(','), 'Push B,Pull B');
  p.gleich('abgeschlossener Zyklus misst sechs Tage', zyklen[0].tage, 6);

  const planung = await js(page, `(() => {
    const ex=EXDB.find(e=>!istZeitArt(exArt(e.id)));
    const d=tagPlus(heuteIso(),-6);
    state.workouts=[{id:'start',date:workoutDatumFuerTag(d),type:'Push',variant:'A',prs:[],exercises:[]}];
    state.plan={}; saveState();
    const labels=tageInfo(d,7).map(x=>x.label);
    const plan={type:'Push',variant:'B',exercises:[{exId:ex.id,name:ex.name,sets:[{w:50,r:''}]}]};
    startWorkout('Push',null,plan,heuteIso(),'B');
    const aktiv={type:state.active.type,variant:state.active.variant,label:einheitLabel(state.active)};
    state.active=null;
    const tpl={id:'alt',name:'Pull B',type:'Pull',exIds:[ex.id]}; state.templates=[tpl];
    startWorkout(null,'alt',null,heuteIso());
    return {labels,aktiv,tpl:{variant:state.active.variant,label:einheitLabel(state.active)}};
  })()`);
  p.gleich('Kalendervorschau bildet alle sechs Tage ab', planung.labels.join(' → '),
    'Push A → Pull A → Rest → Push B → Pull B → Rest → Push A');
  p.gleich('geplanter Push B speichert Variante B', planung.aktiv.label, 'Push B');
  p.gleich('alte Vorlage mit A/B im Namen wird korrekt erkannt', planung.tpl.label, 'Pull B');
};
