// 업무 진행 관리 서비스 워커
// 역할: (1) 오프라인 캐시  (2) 백그라운드 마감 알림(주기적 동기화, 지원 브라우저 한정)

const CACHE = "todo-app-v17";
const META_CACHE = "todo-meta";
const CORE = [
  "./index.html",
  "./style.css?v=17",
  "./script.js?v=17",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== META_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 같은 출처 GET: 네트워크 우선 + 실패 시 캐시 (오프라인 지원, 업데이트도 잘 받음)
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase·폰트 등은 그대로 통과
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

// 앱이 저장해 둔 마감 요약을 읽어 알림 (주기적 동기화 시)
async function notifyFromSummary() {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match("/__summary");
  if (!res) return;
  const s = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  if (s.date !== today) return; // 오래된 요약이면 스킵
  const total = (s.overdue || 0) + (s.dueToday || 0) + (s.dueTomorrow || 0);
  if (total === 0) return;

  const notifiedRes = await cache.match("/__notified");
  const notified = notifiedRes ? await notifiedRes.text() : "";
  if (notified === today) return; // 오늘 이미 알림 보냄

  const parts = [];
  if (s.overdue) parts.push(`지연 ${s.overdue}건`);
  if (s.dueToday) parts.push(`오늘 마감 ${s.dueToday}건`);
  if (s.dueTomorrow) parts.push(`내일 마감 ${s.dueTomorrow}건`);
  await self.registration.showNotification("업무 진행 관리", {
    body: parts.join(" · "),
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "deadline-daily",
  });
  await cache.put("/__notified", new Response(today));
}

self.addEventListener("periodicsync", (e) => {
  if (e.tag === "check-deadlines") e.waitUntil(notifyFromSummary());
});

// 알림 클릭 시 앱 열기/포커스
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
