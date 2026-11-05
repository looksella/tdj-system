"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const configurarServiceWorker = async () => {
      if (process.env.NODE_ENV !== "production") {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const appRegistrations = registrations.filter((registration) => {
          const workers = [registration.active, registration.waiting, registration.installing];
          return workers.some((worker) => {
            if (!worker) return false;
            const script = new URL(worker.scriptURL);
            return script.origin === window.location.origin && script.pathname === "/sw.js";
          });
        });
        await Promise.all(appRegistrations.map((registration) => registration.unregister()));
        return;
      }

      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    };

    configurarServiceWorker().catch((error: unknown) => {
      console.error("No se pudo configurar el service worker.", error);
    });
  }, []);

  return null;
}
