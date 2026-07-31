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
  // Land on the history so a tapped alert leads somewhere that explains it.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((c) => "focus" in c);
      if (open) {
        open.navigate("/#history");
        return open.focus();
      }
      return self.clients.openWindow("/#history");
    }),
  );
});
