const CACHE = "wav-v15";
const CORE = ["./", "index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap";

async function cacheFonts(cache) {
  // Save the font stylesheet and every font file it points to, so the app looks right offline from day one.
  try {
    const res = await fetch(FONT_CSS, { mode: "cors" });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
    await Promise.all(urls.map(u => fetch(u, { mode: "cors" }).then(r => r.ok && cache.put(u, r)).catch(() => {})));
  } catch (e) { /* offline during install: fonts get cached on first online use instead */ }
}

self.addEventListener("install", e => {
  // No skipWaiting here: the page shows an "Update now" banner and asks this worker to take over.
  e.waitUntil(caches.open(CACHE).then(async c => { await c.addAll(CORE); await cacheFonts(c); }));
});
self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.github.com" || url.hostname.endsWith("githubusercontent.com")) return; // sync traffic is never cached
  if (url.origin === location.origin && (req.mode === "navigate" || url.pathname.endsWith(".html"))) {
    // app shell: network first so updates arrive, cache when offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put("index.html", c)); return r; }).catch(() => caches.match("index.html")));
    return;
  }
  // icons and fonts: cache first, fill on the way
  e.respondWith(caches.match(req, { ignoreVary: true }).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; })));
});
