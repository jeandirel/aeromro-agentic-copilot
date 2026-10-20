// Applies the saved or system colour theme before first paint (external file: CSP forbids inline scripts).
(function () {
  var pref = "system";
  try { pref = localStorage.getItem("aeromro.theme") || "system"; } catch (e) { /* storage unavailable */ }
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
