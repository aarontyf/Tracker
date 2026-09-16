/* Service Worker — Fitness Tracker
   WICHTIG: Bei jedem App-Update die Versionsnummer hochzählen (z.B. v6 → v7).
   Trainingsdaten liegen in localStorage und werden davon NIE angefasst. */
const VERSION = 'ft-v107';
const SHELL = './index.html';
const SHELL_MARKER = 'Fitness Tracker V100';
const ASSETS = [SHELL, './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png', './recovery.html'];

async function validShell(response){
  if(!response || !response.ok) return false;
  try{ return (await response.clone().text()).includes(SHELL_MARKER); }
  catch(_){ return false; }
}

async function patchAppShell(response){
  if(!response || !response.ok) return response;
  const text = await response.clone().text();

  // Direkt vor dem Aufbau der sichtbaren Übungsdatenbank einfügen.
  // Dadurch werden die Übungen auch dann sichtbar, wenn index.html selbst
  // noch aus einer alten GitHub-Pages-Version geladen wurde.
  const marker = 'const EXDB_ALL = EXDB_RAW.map';
  if(!text.includes(marker)) return response;
  if(text.includes("['Weighted Pull Ups','Rücken'") && text.includes("['EMOM Pullups','Rücken'")) return response;

  const injection = [
    '',
    '/* V107: zusätzliche Pull-up-Übungen */',
    "EXDB_RAW.push(",
    "  ['Weighted Pull Ups','Rücken','Körpergewicht',['lats'],['biceps','upper_back'],'weighted pull ups weighted pull-up pullups mit gewicht zusatzgewicht'],",
    "  ['EMOM Pullups','Rücken','Körpergewicht',['lats'],['biceps','upper_back'],'emom pullups emom pull ups every minute on the minute klimmzüge emom']",
    ');',
    ''
  ].join('\\n');

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
    if(url===SHELL && !await validShell(response)) throw new Error('invalid app shell');
    await cache.put(url, response);
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