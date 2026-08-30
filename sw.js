/* Service Worker — Fitness Tracker
   WICHTIG: Bei jedem App-Update die Versionsnummer hochzählen (z.B. v6 → v7).
   Sonst zeigt das Handy weiter die alte Version aus dem Cache.
   Trainingsdaten liegen in localStorage und werden davon NIE angefasst. */
const VERSION = 'ft-v100';
const SHELL = './index.html';
const SHELL_MARKER = 'Fitness Tracker V96';
const ASSETS = [SHELL, './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png', './recovery.html'];

async function validShell(response){
  if(!response || !response.ok) return false;
  try{ return (await response.clone().text()).includes(SHELL_MARKER); }
  catch(_){ return false; }
}

async function primeCache(){
  const cache = await caches.open(VERSION);
  for(const url of ASSETS){
    const response = await fetch(url, {cache:'reload'});
    if(!response.ok) throw new Error('asset '+url+' '+response.status);
    if(url===SHELL && !await validShell(response)) throw new Error('invalid app shell');
    await cache.put(url, response);
  }
}

self.addEventListener('install', e=>{
  /* Sofort übernehmen: Auch ein beschädigter alter App-Stand kann dann nicht
     verhindern, dass der reparierte Worker aktiv wird. localStorage bleibt
     dabei vollständig unangetastet. */
  e.waitUntil(primeCache().then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)));   // alte Caches weg
    await self.clients.claim();
  })());
});

/* Network-first für die App-Datei (damit Updates ankommen), Cache-Fallback fürs Gym ohne Empfang */
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith((async()=>{
    const url = new URL(req.url);
    /* Die OAuth-Zustimmungsseite ist eine eigene Anwendung. Sie darf niemals
       als vermeintlich beschädigte App-Hülle verworfen oder durch den
       Fitness-Tracker aus dem Offline-Cache ersetzt werden. */
    const oauthConsent = req.mode==='navigate'
      && (/\/oauth\/consent\/?$/.test(url.pathname));
    try{
      const appShell = req.mode==='navigate' && !url.pathname.endsWith('/recovery.html') && !oauthConsent
        || url.pathname.endsWith('/index.html');
      /* Kein HTTP-Zwischencache für die App-Hülle: So kann ein einmal
         beschädigtes HTML nicht erneut in den Offline-Cache gelangen. */
      const net = await fetch(req, appShell ? {cache:'no-store'} : undefined);
      if(appShell && !await validShell(net)) throw new Error('invalid app shell');
      const cache = await caches.open(VERSION);
      await cache.put(appShell ? SHELL : req, net.clone());
      return net;
    }catch(_){
      const hit = await caches.match(req)
        || (req.mode==='navigate' && !oauthConsent ? await caches.match(SHELL) : null);
      if(hit) return hit;
      throw _;
    }
  })());
});

self.addEventListener('message', e=>{ if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting(); });
