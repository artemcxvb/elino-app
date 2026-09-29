/* Service worker: офлайн-кэш всего приложения */
const CACHE='elino-3f6c2446';
const ASSETS=[
"./",
"./app.js",
"./config.js",
"./data.js",
"./icons/apple-touch-icon.png",
"./icons/favicon-64.png",
"./icons/icon-192.png",
"./icons/icon-512.png",
"./icons/icon-maskable-512.png",
"./img/building.jpg",
"./img/cart.jpg",
"./img/entrance.jpg",
"./img/evacuation.jpg",
"./img/goodt-break.jpg",
"./img/goodt-end.jpg",
"./img/goodt-login.jpg",
"./img/goodt-logo.jpg",
"./img/goodt-start.jpg",
"./img/inloker.jpg",
"./img/mulinet.jpg",
"./img/placement.jpg",
"./img/pogruzchik.jpg",
"./img/qr-appstore.png",
"./img/qr-googleplay.png",
"./img/qr-materials.png",
"./img/qr-test-object.png",
"./img/qr-test-sklad.png",
"./img/qr-video.png",
"./img/richtrak.jpg",
"./img/rohlya.jpg",
"./img/routes-map.jpg",
"./img/shtabeler.jpg",
"./img/sscc.jpg",
"./img/tsd-list.jpg",
"./img/tsd-login-razm.jpg",
"./img/tsd-login-sborka.jpg",
"./img/tsd-nachat.jpg",
"./img/tsd-razmeshchenie.jpg",
"./img/tsd-sborki.jpg",
"./img/tsd.jpg",
"./index.html",
"./manifest.webmanifest",
"./questions.js",
"./style.css",
"./unlock.js"
];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url); if(u.origin!==location.origin)return;
  // config.js и страница — сначала сеть (чтобы быстро подхватить новый адрес таблицы), при офлайне — кэш
  if(/\/(config\.js|index\.html)?$/.test(u.pathname)){
    e.respondWith(fetch(e.request).then(resp=>{if(resp&&resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return resp;})
      .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request).then(resp=>{
    if(resp&&resp.ok){const cp=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));} return resp;
  }).catch(()=>caches.match('./index.html'))));
});
