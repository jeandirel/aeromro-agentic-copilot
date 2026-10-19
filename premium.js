/* Progressive enhancement of the AeroMRO cockpit UI. API remains authoritative. */
"use strict";

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    const field = document.getElementById("questionInput");
    const form = document.getElementById("askForm");
    if (!field || !form) return;
    field.value = button.dataset.prompt || "";
    field.focus();
    if (form.reportValidity()) form.requestSubmit();
  });
});
const question = document.getElementById("questionInput");
if (question) {
  question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const form = document.getElementById("askForm");
      if (form && form.reportValidity()) form.requestSubmit();
    }
  });
}
document.querySelectorAll(".hero-engine-image,.showcase-item img,.engine-cover img,.copilot-photo img").forEach((img) => {
  img.addEventListener("error", () => {
    img.hidden = true;
    img.parentElement?.classList.add("image-unavailable");
  });
});
