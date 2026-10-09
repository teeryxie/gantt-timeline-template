// Apply the saved theme before CSS paints; keep this preference on this device.
(() => {
  const key = "gantt-timeline-theme";
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = null;
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {
    /* The switch still works when browser storage is unavailable. */
  }
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById("theme-toggle");
    if (button) {
      const dark = theme === "dark";
      const label = dark ? "切换到浅色模式" : "切换到深色模式";
      button.disabled = false;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(dark));
      button.innerHTML = dark
        ? '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5"/><path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6l1.4 1.4m10 10 1.4 1.4m0-12.8L15 5M5 15l-1.4 1.4"/></svg><span>浅色</span>'
        : '<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.8 12.3A7.2 7.2 0 0 1 7.7 3.2a7.2 7.2 0 1 0 9.1 9.1Z"/></svg><span>深色</span>';
    }
  };
  apply(preference || (system.matches ? "dark" : "light"));
  system.addEventListener("change", () => {
    if (!preference) apply(system.matches ? "dark" : "light");
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply(document.documentElement.dataset.theme);
    document.getElementById("theme-toggle").onclick = () => {
      preference =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(key, preference);
      } catch {
        /* Session-only fallback. */
      }
      apply(preference);
    };
  });
})();
