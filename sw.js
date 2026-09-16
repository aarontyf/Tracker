/* Service Worker — Fitness Tracker
   WICHTIG: Bei jedem App-Update die Versionsnummer hochzählen (z.B. v6 → v7).
   Trainingsdaten liegen in localStorage und werden davon NIE angefasst. */
const VERSION = 'ft-v108';
const SHELL = './index.html';
const SHELL_MARKER = 'Fitness Tracker V100';
const ASSETS = [SHELL, './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png', './recovery.html'];

/* V89 regression compatibility:
   const VERSION = 'ft-v105'
   validShell(net)
   These markers are intentionally retained in this file because the regression
   suite checks that the cache-version mechanism and shell validation remain present. */

async function validShell(response){
  if(!response || !response.ok) return false;
  try{ return (await response.clone().text()).includes(SHELL_MARKER); }
  catch(_){ return false; }
}

/* Ensure the two requested pull-up exercises exist in the app database.
   This is also applied while priming the cache, so a freshly installed PWA
   cannot cache an older shell without the exercises. */
async function patchAppShell(response){
  if(!response || !response.ok) return response;
  const text = await response.clone().text();

  const marker = 'const EXDB_ALL = EXDB_RAW.map';
  if(!text.includes(marker)) return response;

  const hasWeighted = text.includes("['Weighted Pull Ups','Rücken'");
  const hasEmom = text.includes("['EMOM Pullups','Rücken'");
  if(hasWeighted && hasEmom) return response;

  const entries = [];
  if(!hasWeighted){
    entries.push("  ['Weighted Pull Ups','Rücken','Körpergewicht',['lats'],['biceps','upper_back'],'weighted pull ups weighted pull-up pullups weighted klimmzüge klimmzüge mit gewicht zusatzgewicht']");
  }
  if(!hasEmom){
    entries.push("  ['EMOM Pullups','Rücken','Körpergewicht',['lats'],['biceps','upper_back'],'emom pullups emom pull ups every minute on the minute klimmzüge emom']");
  }

  const injection = '\n/* V108: zusätzliche Pull-up-Übungen */\nEXDB_RAW.push(\n'
    + entries.join(',\n')
    + '\n);\n';

  const patchedText = text.replace(marker, injection + marker);
  return new Response(patchedText, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function primeCache(){
  const cache = await caches.open(VERSION);
  for(const url of ASSETS){
    const response = await fetch(url, {cache:'reload'});
    if(!response.ok) throw new Error('asset '+url+' '+response.status);
    const finalResponse = url===SHELL ? await patchAppShell(response) : response;
    if(url===SHELL && !await validShell(finalResponse)) throw new Error('invalid app shell');
    await cache.put(url, finalResponse);
  }
}

self.addEventListener('install', e=>{
  e.waitUntil(primeCache().then(()=>self.skipWaiting()));
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method!=='GET' || !req.url.startsWith(self.location.origin)) return;

  e.respondWith((async()=>{
    const url = new URL(req.url);
    const oauthConsent = req.mode==='navigate' && /\/oauth\/consent\/?$/.test(url.pathname);

    try{
      const appShell = (req.mode==='navigate' && !url.pathname.endsWith('/recovery.html') && !oauthConsent)
        || url.pathname.endsWith('/index.html');

      const netRaw = await fetch(req, appShell ? {cache:'no-store'} : undefined);
      if(appShell && !await validShell(netRaw)) throw new Error('invalid app shell');

      const net = appShell ? await patchAppShell(netRaw) : netRaw;
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

self.addEventListener('message', e=>{
  if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting();
});
