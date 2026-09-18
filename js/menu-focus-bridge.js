/*
 * Ray-Ban Display host-focus bridge for the dynamic destination menu.
 *
 * The app owns D-pad selection through .menu-row.focused. Keep the browser's
 * activeElement on that same row so host pinch/select activation targets the
 * visible choice instead of a stale control behind the overlay.
 */
(function () {
  "use strict";

  const menu = document.querySelector("#menu");
  const menuScroll = document.querySelector("#menu-scroll");
  const menuList = document.querySelector("#menu-list");
  const controls = document.querySelector("#controls");
  const search = document.querySelector("#search");
  const picker = document.querySelector("#picker");

  if (!menu || !menuScroll || !menuList || !controls || !search || !picker) return;

  function focusWithoutScroll(element) {
    if (!element || document.activeElement === element) return;
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }
  }

  function updateMenuScrims() {
    const maxScrollTop = Math.max(0, menuList.scrollHeight - menuList.clientHeight);
    const atTop = menuList.scrollTop <= 1;
    const atBottom = maxScrollTop <= 1 || menuList.scrollTop >= maxScrollTop - 1;

    menuScroll.classList.toggle("at-top", atTop);
    menuScroll.classList.toggle("at-bottom", atBottom);
  }

  function syncMenuRows() {
    const rows = Array.from(menuList.querySelectorAll(".menu-row"));
    const selected = menuList.querySelector(".menu-row.focused");

    rows.forEach((row) => {
      row.setAttribute("role", "button");
      row.tabIndex = row === selected ? 0 : -1;
    });

    if (!menu.classList.contains("hidden")) focusWithoutScroll(selected);
    requestAnimationFrame(updateMenuScrims);
  }

  function restoreFocusAfterMenuClose() {
    if (!menu.classList.contains("hidden")) return;

    const active = document.activeElement;
    if (active && menuList.contains(active) && typeof active.blur === "function") {
      active.blur();
    }

    // Search owns the native composer focus, and picker mode owns the D-pad.
    if (!search.classList.contains("hidden") || !picker.classList.contains("hidden")) return;

    focusWithoutScroll(controls.querySelector(".focusable.focused"));
  }

  const observer = new MutationObserver(() => {
    syncMenuRows();
    restoreFocusAfterMenuClose();
  });

  observer.observe(menuList, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  observer.observe(menu, {
    attributes: true,
    attributeFilter: ["class"],
  });

  menuList.addEventListener("scroll", updateMenuScrims, { passive: true });

  syncMenuRows();
  updateMenuScrims();
  restoreFocusAfterMenuClose();
})();
