// Plantão Ref — Service Worker
// Permite abrir o app e consultar o conteúdo sem internet, depois da 1ª visita.
// Também avisa quando há uma versão nova do app disponível (ver CACHE_NAME abaixo).

const CACHE_NAME = 'plantaoref-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './data.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  // NÃO chama self.skipWaiting() aqui de propósito — a página avisa o usuário
  // e só manda ativar a nova versão quando ele tocar em "Atualizar".
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Nunca interceptar chamadas à API do GitHub — precisam sempre ir direto à rede
// (é assim que o modo de edição sincroniza; cache aqui quebraria o fluxo de salvar).
function isGithubApi(url) {
  return url.origin === 'https://api.github.com';
}

// data.json: tenta a rede primeiro (pega a versão mais nova quando online),
// cai para o cache se estiver offline.
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

// Demais arquivos do app (HTML, ícones, fontes): cache primeiro (mais rápido),
// atualiza o cache em segundo plano quando online.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request)
    .then(fresh => {
      if (fresh && fresh.status === 200) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, fresh.clone()));
      }
      return fresh;
    })
    .catch(() => null);
  return cached || (await networkPromise) || Response.error();
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return; // não mexer em PUT/POST (salvar no GitHub)
  if (isGithubApi(url)) return; // deixa passar direto

  if (url.pathname.endsWith('data.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
