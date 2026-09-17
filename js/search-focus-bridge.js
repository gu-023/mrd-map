/*
 * Ray-Ban Display host-focus bridge for search fallback controls.
 *
 * The app owns search D-pad selection through .focused classes. Keep the
 * browser's activeElement on the selected fallback key or Places prediction so
 * host pinch/select activation targets the visible choice. Native composer
 * focus remains owned by the app's real search input.
 */
(function () {
  "use strict";

  const search = document.querySelector("#search");
  const searchQuery = document.querySelector("#search-query");
  const searchKeyboard = document.querySelector("#search-keyboard");
  const searchPreds = document.querySelector("#search-preds");
  const menu = document.querySelector("#menu");
  const picker = document.querySelector("#picker");
  const controls = document.querySelector("#controls");

  if (!search || !searchQuery || !searchKeyboard || !searchPreds || !menu || !picker || !controls) return;

  function focusWithoutScroll(element) {
    if (!element || document.activeElement === element) return;
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
  }

  function makeRovingButtons(elements, selected) {
    elements.forEach((element) => {
      element.setAttribute("role", "button");
      element.tabIndex = element === selected ? 0 : -1;
    });
  }

  function syncSearchControls() {
    const keys = Array.from(searchKeyboard.querySelectorAll(".key"));
    const predictions = Array.from(searchPreds.querySelectorAll(".pred"));
    const selectedKey = searchKeyboard.querySelector(".key.focused");
    const selectedPrediction = searchPreds.querySelector(".pred.focused");

    makeRovingButtons(keys, selectedKey);
    makeRovingButtons(predictions, selectedPrediction);

    if (search.classList.contains("hidden")) return;

    // The app explicitly owns focus for the real input/native composer path.
    if (searchQuery.classList.contains("focused")) return;

    focusWithoutScroll(selectedKey || selectedPrediction);
  }

  function restoreFocusAfterSearchClose() {
    if (!search.classList.contains("hidden")) return;

    const active = document.activeElement;
    if (active && search.contains(active) && typeof active.blur === "function") {
      active.blur();
    }

    // A destination menu or picker opened from search owns focus/D-pad next.
    if (!menu.classList.contains("hidden") || !picker.classList.contains("hidden")) return;

    focusWithoutScroll(controls.querySelector(".focusable.focused"));
  }

  const observer = new MutationObserver(() => {
    syncSearchControls();
    restoreFocusAfterSearchClose();
  });

  observer.observe(search, {
    attributes: true,
    attributeFilter: ["class"],
  });
  observer.observe(searchQuery, {
    attributes: true,
    attributeFilter: ["class"],
  });
  observer.observe(searchKeyboard, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  observer.observe(searchPreds, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  syncSearchControls();
  restoreFocusAfterSearchClose();
})();
