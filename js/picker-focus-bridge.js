/*
 * Ray-Ban Display host-focus bridge for the map destination picker.
 *
 * The picker already owns D-pad movement in app.js. Keep DOM focus on the
 * visible crosshair so a host pinch/select targets it, and translate a host
 * click into the existing Enter path instead of duplicating routing logic.
 */
(function () {
  "use strict";

  const picker = document.querySelector("#picker");
  const controls = document.querySelector("#controls");
  const menu = document.querySelector("#menu");
  const search = document.querySelector("#search");

  if (!picker || !controls || !menu || !search) return;

  function focusWithoutScroll(element) {
    if (!element || document.activeElement === element) return;
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
  }

  function syncPickerFocus() {
    const open = !picker.classList.contains("hidden");
    picker.setAttribute("role", "button");
    picker.setAttribute("aria-label", "地図中央を目的地に確定");
    picker.tabIndex = open ? 0 : -1;

    if (open) {
      focusWithoutScroll(picker);
      return;
    }

    if (document.activeElement === picker && typeof picker.blur === "function") picker.blur();

    // If another overlay takes over immediately, let its bridge own focus.
    if (!menu.classList.contains("hidden") || !search.classList.contains("hidden")) return;

    focusWithoutScroll(controls.querySelector(".focusable.focused"));
  }

  picker.addEventListener("click", () => {
    if (picker.classList.contains("hidden")) return;
    picker.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
    }));
  });

  const observer = new MutationObserver(syncPickerFocus);
  observer.observe(picker, {
    attributes: true,
    attributeFilter: ["class"],
  });

  syncPickerFocus();
})();
