"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) =>
          console.log("PWA Service Worker running securely:", reg.scope)
        )
        .catch((err) => console.error("PWA Initialization failed:", err));
    }
  }, []);
  return null;
}
