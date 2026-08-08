/* Service Worker — Fitness Tracker
   WICHTIG: Bei jedem App-Update die Versionsnummer hochzählen (z.B. v6 → v7).
   Sonst zeigt das Handy weiter die alte Version aus dem Cache.
   Trainingsdaten liegen in localStorage und werden davon NIE angefasst. */
const VERSION = 'ft-v57';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).catch(()=>{}));
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
    try{
      const net = await fetch(req);
      const cache = await caches.open(VERSION);
      cache.put(req, net.clone());
      return net;
    }catch(_){
      const hit = await caches.match(req);
      if(hit) return hit;
      if(req.mode==='navigate'){ const idx = await caches.match('./index.html'); if(idx) return idx; }
      throw _;
    }
  })());
});

self.addEventListener('message', e=>{ if(e.data && e.data.type==='SKIP_WAITING') self.skipWaiting(); });
