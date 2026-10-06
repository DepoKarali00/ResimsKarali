/* ════════════════════════════════════════════════════
   sw.js — Stok Kataloğum Service Worker
   Statik dosyaları önbelleğe alır (HTML, CSS, JS, font)
   Google Drive API isteklerini CACHE FIRST ile yönetmez
   (çünkü auth token gerektirir), sadece app shell'i cache'ler.
   ════════════════════════════════════════════════════ */

const CACHE_NAME = 'katalog-shell-v2';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://accounts.google.com/gsi/client',
];

/* Kurulumda statik dosyaları önbelleğe al */
self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.allSettled(
        SHELL_URLS.map(function(url){
          return cache.add(url).catch(function(err){
            console.warn('[SW] Cache add failed for:', url, err);
          });
        })
      );
    })
  );
});

/* Aktivasyonda eski cache'leri temizle */
self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

/* Fetch stratejisi:
   - Google Drive API → her zaman network (token gerekli)
   - Diğer → Network First, hata varsa Cache fallback
*/
self.addEventListener('fetch', function(event){
  var url = event.request.url;

  // Google Drive ve Auth API'leri → sadece network
  if(
    url.includes('googleapis.com') ||
    url.includes('accounts.google.com') ||
    url.includes('google.com/gsi')
  ){
    return; // service worker pass-through
  }

  // Diğerleri için Network First
  event.respondWith(
    fetch(event.request)
      .then(function(response){
        // Başarılı response → cache'e koy
        if(response && response.status === 200 && event.request.method === 'GET'){
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
        }
        return response;
      })
      .catch(function(){
        // Network yok → cache'den dön
        return caches.match(event.request).then(function(cached){
          return cached || new Response('Çevrimdışısın ve bu içerik önbellekte yok.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});
