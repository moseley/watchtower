// Watchtower service worker — receives Web Push and shows notifications.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // non-JSON payload; show a generic notification
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Watchtower", {
      body: data.body || "",
      data: data.data || {},
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
