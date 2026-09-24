/*
 * Ray-Ban Display search scroll-affordance bridge.
 *
 * js/app.js owns D-pad selection, roving tabIndex, document.activeElement, and
 * focus restoration. This bridge only preserves semantic button roles plus the
 * compact keyboard/prediction scroll affordances used on the 600x600 display.
 */
(function () {
  "use strict";

  const search = document.querySelector("#search");
  const searchKeyboardScroll = document.querySelector("#search-keyboard-scroll");
  const searchKeyboard = document.querySelector("#search-keyboard");
  const searchPredsScroll = document.querySelector("#search-preds-scroll");
  const searchPreds = document.querySelector("#search-preds");

  if (!search || !searchKeyboardScroll || !searchKeyboard || !searchPredsScroll || !searchPreds) return;

  function markInteractive(elements) {
    elements.forEach((element) => element.setAttribute("role", "button"));
  }

  function updateKeyboardScrims() {
    const maxScrollTop = Math.max(0, searchKeyboard.scrollHeight - searchKeyboard.clientHeight);
    const atTop = searchKeyboard.scrollTop <= 1;
    const atBottom = maxScrollTop <= 1 || searchKeyboard.scrollTop >= maxScrollTop - 1;

    searchKeyboardScroll.classList.toggle("at-top", atTop);
    searchKeyboardScroll.classList.toggle("at-bottom", atBottom);
  }

  function updatePredictionScrims() {
    const maxScrollTop = Math.max(0, searchPreds.scrollHeight - searchPreds.clientHeight);
    const atTop = searchPreds.scrollTop <= 1;
    const atBottom = maxScrollTop <= 1 || searchPreds.scrollTop >= maxScrollTop - 1;

    searchPredsScroll.classList.toggle("at-top", atTop);
    searchPredsScroll.classList.toggle("at-bottom", atBottom);
  }

  function syncSearchAffordances() {
    const keys = Array.from(searchKeyboard.querySelectorAll(".key"));
    const predictions = Array.from(searchPreds.querySelectorAll(".pred"));
    const selectedKey = searchKeyboard.querySelector(".key.focused");

    markInteractive(keys);
    markInteractive(predictions);

    if (search.classList.contains("hidden")) return;

    // Keep the selected fallback key inside the compact scrollable keyboard zone.
    if (selectedKey && typeof selectedKey.scrollIntoView === "function") {
      selectedKey.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    requestAnimationFrame(updateKeyboardScrims);
    requestAnimationFrame(updatePredictionScrims);
  }

  const observer = new MutationObserver(syncSearchAffordances);

  observer.observe(search, {
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

  searchKeyboard.addEventListener("scroll", updateKeyboardScrims, { passive: true });
  searchPreds.addEventListener("scroll", updatePredictionScrims, { passive: true });

  syncSearchAffordances();
  updateKeyboardScrims();
  updatePredictionScrims();
})();
