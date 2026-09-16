(() => {
  "use strict";
  if (!window.isSecureContext || !["http:", "https:"].includes(location.protocol) || !("serviceWorker" in navigator)) return;

  const section = document.getElementById("pwaSection");
  const status = document.getElementById("pwaStatus");
  const installButton = document.getElementById("installApp");
  const updateButton = document.getElementById("updateApp");
  const help = document.getElementById("installHelp");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let installPrompt = null, registration = null, offlineReady = false, reloadForUpdate = false;
  let installed = standalone.matches || navigator.standalone === true;
  section.hidden = false;

  function render() {
    installButton.hidden = installed || !installPrompt;
    help.hidden = installed;
    updateButton.hidden = !registration?.waiting;
    status.textContent = registration?.waiting ? "An update is ready. Reload when you're finished listening."
      : offlineReady ? (navigator.onLine ? "Ready for offline use." : "Offline. Your sounds are ready to play.")
      : "Preparing offline access...";
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); installPrompt = event; render();
  });
  window.addEventListener("appinstalled", () => {
    installed = true; installPrompt = null; render();
  });
  standalone.addEventListener("change", event => { installed = event.matches; render(); });
  window.addEventListener("online", render);
  window.addEventListener("offline", render);

  installButton.addEventListener("click", async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    installPrompt = null; render();
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { help.hidden = false; help.open = true; }
  });
  updateButton.addEventListener("click", () => {
    if (!registration?.waiting) return;
    reloadForUpdate = true;
    updateButton.disabled = true;
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadForUpdate) { location.reload(); return; }
    offlineReady = !!registration?.active; render();
  });

  (async () => {
    try {
      const scope = new URL("./", location.href).href;
      registration = await navigator.serviceWorker.getRegistration(scope);
      const existing = registration?.scope === scope;
      // Reuse an installed worker offline; registration can otherwise attempt a network fetch.
      if (!existing) registration = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
      const observe = worker => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") render();
          if (worker.state === "activated") { offlineReady = true; render(); }
          if (worker.state === "redundant" && !registration.active) status.textContent = "Offline setup failed. Reload while online to try again.";
        });
      };
      registration.addEventListener("updatefound", () => observe(registration.installing));
      observe(registration.installing); offlineReady = !!registration.active; render();
      await navigator.serviceWorker.ready;
      offlineReady = !!registration.active; render();
      if (existing && navigator.onLine) registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine) registration.update().catch(() => {});
      });
    } catch {
      status.textContent = "Offline setup is unavailable. Reload while online to try again.";
    }
  })();
})();
