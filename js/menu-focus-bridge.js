/*
 * Ray-Ban Display semantic/scroll bridge for the dynamic destination menu.
 *
 * js/app.js owns D-pad selection, roving tabIndex, and browser focus. This
 * bridge only adds button semantics and 600x600 scroll-edge affordances.
 */
(function () {
  "use strict";

  const menuScroll = document.querySelector("#menu-scroll");
  const menuList = document.querySelector("#menu-list");

  if (!menuScroll || !menuList) return;

  function updateMenuScrims() {
    const maxScrollTop = Math.max(0, menuList.scrollHeight - menuList.clientHeight);
    const atTop = menuList.scrollTop <= 1;
    const atBottom = maxScrollTop <= 1 || menuList.scrollTop >= maxScrollTop - 1;

    menuScroll.classList.toggle("at-top", atTop);
    menuScroll.classList.toggle("at-bottom", atBottom);
  }

  function syncMenuRows() {
    const rows = Array.from(menuList.querySelectorAll(".menu-row"));

    rows.forEach((row) => {
      row.setAttribute("role", "button");
    });

    requestAnimationFrame(updateMenuScrims);
  }

  const observer = new MutationObserver(syncMenuRows);

  observer.observe(menuList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  menuList.addEventListener("scroll", updateMenuScrims, { passive: true });

  syncMenuRows();
  updateMenuScrims();
})();
