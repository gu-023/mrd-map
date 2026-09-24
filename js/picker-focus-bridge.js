/*
 * Ray-Ban Display picker activation bridge.
 *
 * js/app.js owns picker visibility, tabIndex, document.activeElement, and
 * focus restoration. This bridge only exposes button semantics and translates
 * a host pinch/click into the existing Enter path.
 */
(function () {
  "use strict";

  const picker = document.querySelector("#picker");
  if (!picker) return;

  picker.setAttribute("role", "button");
  picker.setAttribute("aria-label", "地図中央を目的地に確定");

  picker.addEventListener("click", () => {
    if (picker.classList.contains("hidden")) return;
    picker.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
    }));
  });
})();
