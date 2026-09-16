"use strict";

(() => {
  const button = document.getElementById("shareApp");
  const status = document.getElementById("shareStatus");
  const dialog = document.getElementById("shareDialog");
  const field = document.getElementById("shareUrl");
  const url = document.querySelector('link[rel="canonical"]').href;
  let busy = false;
  let clearStatus;

  function announce(message) {
    clearTimeout(clearStatus);
    status.textContent = message;
    clearStatus = setTimeout(() => { status.textContent = ""; }, 5000);
  }

  button.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "Harmonics by 313", url });
          return;
        } catch (error) {
          if (error.name === "AbortError") return;
        }
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(url);
        announce("Link copied");
      } catch {
        field.value = url;
        dialog.showModal();
        field.focus();
        field.select();
      }
    } finally {
      busy = false;
    }
  });

  dialog.addEventListener("close", () => button.focus());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
})();
