/*
 * MRD Map — Ray-Ban Display 向け現在地マップ Web App
 *
 * 操作モデル（Neural Band の D-pad は矢印キーとして届く）:
 *   通常モード:  ← →   操作ボタン間のフォーカス移動
 *               Enter  フォーカス中のボタンを実行
 *   移動モード:  ←↑↓→  地図をパン  /  Enter で移動モード終了
 *
 * ディスプレイ前提: 600x600・加算表示（黒=透明）。地図は暗いスタイルで高コントラストに。
 */

(function () {
  "use strict";

  const cfg = window.CONFIG || {};
  const $ = (sel) => document.querySelector(sel);

  const els = {
    app: $("#app"),
    map: $("#map"),
    canvas: $("#map-canvas"),
    headingArrow: $("#heading-arrow"),
    picker: $("#picker"),
    navBanner: $("#nav-banner"),
    menu: $("#menu"),
    menuTitle: $("#menu-title"),
    menuList: $("#menu-list"),
    search: $("#search"),
    searchQuery: $("#search-query"),
    searchKeyboard: $("#search-keyboard"),
    searchPreds: $("#search-preds"),
    gpsDot: $("#gps-dot"),
    gpsText: $("#gps-text"),
    accText: $("#acc-text"),
    controls: $("#controls"),
    error: $("#error-overlay"),
  };

  let map = null;
  let userMarker = null;
  let accuracyCircle = null;
  let followMode = true; // GPS を追従して中央に保つ
  let panMode = false;
  let compassOn = false;
  let curHeading = 0; // 平滑化した方位（0=北, 時計回り）
  let orientHandler = null;
  // ナビ
  let directionsService = null;
  let directionsRenderer = null;
  let pickMode = false; // 目的地選択（中央十字）モード
  let navMode = false; // ナビ中
  let navSteps = [];
  let navStepIdx = 0;
  let navDestination = null; // リルート用に目的地を保持
  let navFullPath = []; // オフルート判定用の詳細経路点
  let offRouteCount = 0;
  let navRerouting = false;
  let routeRequestId = 0; // 古い Directions callback を無視するための世代番号
  let navBounds = null; // ルート全体の範囲（プレビュー用）
  let zoomedForTurn = false; // 曲がり角ズーム中か
  // 信号機（OpenStreetMap）
  let signalsOn = true;
  let signalData = [];
  let signalMarkers = [];
  let signalRequestId = 0; // 古い Overpass callback を無視するための世代番号
  let geocoder = null;
  let travelMode = "WALKING"; // WALKING / DRIVING / BICYCLING / TRANSIT
  // メニュー
  let menuOpen = false;
  let menuIdx = 0;
  let menuItems = [];
  // 検索
  let autocompleteService = null;
  let placesService = null;
  let searchToken = null;
  let searchOpen = false;
  let searchQuery = "";
  let searchPredictions = [];
  let searchZone = "keys"; // keys / preds
  let keyIdx = 0;
  let predIdx = 0;
  let predictionRequestId = 0; // 古い Autocomplete callback を無視するための世代番号
  let placeDetailsRequestId = 0; // 古い Place Details callback を無視するための世代番号
  const SEARCH_COLS = 9;
  const SEARCH_KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("").concat(["␣", "⌫", "✕"]);

  /* ---------- 起動時チェック ---------- */
  function showError(titleHtml, bodyHtml) {
    els.error.innerHTML =
      `<div class="title">${titleHtml}</div><div>${bodyHtml}</div>`;
    els.error.classList.remove("hidden");
  }

  if (!cfg.GOOGLE_MAPS_API_KEY || cfg.GOOGLE_MAPS_API_KEY === "__GOOGLE_MAPS_API_KEY__") {
    showError(
      "APIキー未設定",
      "ローカル: <code>cp js/config.template.js js/config.js</code> してキーを設定。<br>" +
      "本番: GitHub Secret <code>GOOGLE_MAPS_API_KEY</code> を設定。<br>(README 参照)"
    );
    return;
  }

  // Google Maps の認証/認可エラー（キー・リファラー・API未有効化・課金）はここに来る。
  // 具体的な MapError コードはコンソールに出るが、実機向けに画面でも案内する。
  window.gm_authFailure = function () {
    showError(
      "Google Maps 認証エラー",
      "次のいずれかが原因です：<br>" +
      "・Maps JavaScript API が未有効化<br>" +
      "・リファラー制限の不一致<br>" +
      "・課金(Billing)未設定<br>" +
      "PCのChromeコンソールで <code>◯◯MapError</code> を確認してください。"
    );
  };

  /* ---------- Google Maps スクリプトを動的ロード ---------- */
  function loadGoogleMaps() {
    return new Promise((resolve, reject) => {
      window.__mrdMapInit = resolve;
      const s = document.createElement("script");
      const key = encodeURIComponent(cfg.GOOGLE_MAPS_API_KEY);
      s.src =
        `https://maps.googleapis.com/maps/api/js?key=${key}` +
        `&callback=__mrdMapInit&libraries=marker,geometry,places&loading=async&language=ja&region=JP`;
      s.async = true;
      s.onerror = () => reject(new Error("Google Maps の読み込みに失敗"));
      document.head.appendChild(s);
    });
  }

  /* 加算ディスプレイ向けの暗い地図スタイル（黒地・明線） */
  const DARK_STYLE = [
    { elementType: "geometry", stylers: [{ color: "#000000" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#000000" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#3a3a3a" }] },
    { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#5a5a5a" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#7a7a4a" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1a2a" }] },
    { featureType: "poi", elementType: "geometry", stylers: [{ color: "#101510" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0d1f0d" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a2a3a" }] },
    // 加算ディスプレイの視認性のためラベルを間引く（POI/施設名は非表示、道路名は残す）
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
  ];

  function initMap() {
    map = new google.maps.Map(els.canvas, {
      center: cfg.DEFAULT_CENTER || { lat: 35.681236, lng: 139.767125 },
      zoom: cfg.DEFAULT_ZOOM || 16,
      disableDefaultUI: true, // 自前の D-pad UI を使う
      gestureHandling: "none",
      keyboardShortcuts: false,
      clickableIcons: false,
      styles: DARK_STYLE,
    });

    userMarker = new google.maps.Marker({
      map,
      title: "現在地",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#4dd6a0",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
      },
    });

    accuracyCircle = new google.maps.Circle({
      map,
      strokeColor: "#4dd6a0",
      strokeOpacity: 0.5,
      strokeWeight: 1,
      fillColor: "#4dd6a0",
      fillOpacity: 0.08,
    });

    // ユーザーが移動モードで地図を動かしたら追従を解除
    map.addListener("dragstart", () => (followMode = false));

    directionsService = new google.maps.DirectionsService();
    geocoder = new google.maps.Geocoder();

    startGeolocation();
  }

  /* ---------- 位置情報（標準ブラウザ API） ----------
   * グラスのホストは、位置情報の許可プロンプトを「ユーザー操作（決定ボタン）」
   * 起点でないと通さず、ページ読み込み時の自動要求は即拒否する。
   * そのため自動取得はせず、◎ボタン押下の中で getCurrentPosition を直接呼ぶ。
   */
  let geoWatchStarted = false;

  function startGeolocation() {
    if (!("geolocation" in navigator)) {
      setGps(false, "GPS非対応");
      return;
    }
    setGps(false, "◎ を決定で現在地取得");
  }

  // ◎ボタンの click/keydown ハンドラ内（＝ユーザー操作中）から呼ぶこと
  function acquireLocation() {
    if (!("geolocation" in navigator)) {
      setGps(false, "GPS非対応");
      return;
    }
    setGps(false, "GPS取得中…");
    // 高精度は指定しない（公式サンプル準拠）。古い位置も許容して即表示。
    navigator.geolocation.getCurrentPosition(onPosition, onGeoError, {
      maximumAge: 60000,
      timeout: 15000,
    });
    // 一度許可が通れば継続更新を開始（多重登録は防ぐ）
    if (!geoWatchStarted) {
      geoWatchStarted = true;
      navigator.geolocation.watchPosition(onPosition, onWatchError, {
        maximumAge: 30000,
        timeout: 60000,
      });
    }
  }

  function onWatchError(err) {
    if (err && err.code === err.PERMISSION_DENIED) onGeoError(err);
    // それ以外（timeout 等）は無視。watch は監視を継続する。
  }

  /* ---------- コンパス（ヘディングアップ） ----------
   * 方位センサーも位置情報同様、グラスではユーザー操作起点でないと許可が出ない。
   * 取得した方位ぶんだけ地図キャンバスを逆回転させ、進行方向を常に画面の上にする。
   */
  function toggleCompass() {
    if (compassOn) {
      disableCompass();
    } else {
      enableCompass(); // ★ボタン押下（ユーザー操作）の中から呼ぶこと
    }
  }

  function enableCompass() {
    const start = () => {
      compassOn = true;
      els.headingArrow.classList.remove("hidden");
      // iOS/WebKit は webkitCompassHeading、その他は絶対方位イベント
      window.addEventListener("deviceorientationabsolute", onOrient, true);
      window.addEventListener("deviceorientation", onOrient, true);
    };
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((state) => {
          if (state === "granted") start();
          else showError("方位センサーが拒否されました", "🧭 を決定でもう一度試してください。");
        })
        .catch(() => showError("方位センサーを開始できません", "🧭 を決定で再試行。"));
    } else if (DOE) {
      start();
    } else {
      showError("方位センサー非対応", "この端末では向き連動を利用できません。");
    }
  }

  function disableCompass() {
    compassOn = false;
    window.removeEventListener("deviceorientationabsolute", onOrient, true);
    window.removeEventListener("deviceorientation", onOrient, true);
    els.headingArrow.classList.add("hidden");
    curHeading = 0;
    els.canvas.style.transform = "translate(-50%, -50%) rotate(0deg)";
    setGps(true, "GPS"); // ステータス表示を方位から通常に戻す
  }

  function headingFromEvent(e) {
    if (typeof e.webkitCompassHeading === "number") return e.webkitCompassHeading; // iOS: 0=北・時計回り
    if (e.absolute && typeof e.alpha === "number") return (360 - e.alpha) % 360; // 絶対方位
    return null;
  }

  function onOrient(e) {
    const h = headingFromEvent(e);
    if (h == null || isNaN(h)) return;
    // 最短経路で平滑化（コンパスはノイズが多い）
    let diff = ((h - curHeading + 540) % 360) - 180;
    curHeading = (curHeading + diff * 0.2 + 360) % 360;
    els.canvas.style.transform = `translate(-50%, -50%) rotate(${-curHeading}deg)`;
    els.gpsText.textContent = `🧭 ${Math.round(curHeading)}° ${cardinal(curHeading)}`;
  }

  function cardinal(deg) {
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  }

  /* ---------- ナビ（目的地選択 → 徒歩ルート → 次の曲がり角） ---------- */
  function setNavBanner(html) {
    if (html == null) {
      els.navBanner.classList.add("hidden");
      els.navBanner.innerHTML = "";
    } else {
      els.navBanner.innerHTML = html;
      els.navBanner.classList.remove("hidden");
    }
  }

  // 🚩: 目的地メニューを開く（選択中モードなら抜ける）
  function toggleNav() {
    if (pickMode) {
      exitPickMode();
    } else {
      openDestinationMenu();
    }
  }

  /* ---------- お気に入り/履歴（localStorage・ログイン不要） ---------- */
  function loadList(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; }
  }
  function saveList(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function placeKey(lat, lng) { return lat.toFixed(4) + "," + lng.toFixed(4); }

  function addToList(key, place, cap) {
    const list = loadList(key).filter(
      (p) => placeKey(p.lat, p.lng) !== placeKey(place.lat, place.lng)
    );
    list.unshift(place);
    if (list.length > cap) list.length = cap;
    saveList(key, list);
  }

  function saveRecent(dest, name) {
    const lat = dest.lat(), lng = dest.lng();
    addToList("mrd.recents", { name: name || placeKey(lat, lng), lat, lng }, 8);
    if (!name) resolvePlaceName(lat, lng); // 名前未指定なら住所を後付け
  }

  function isFav(lat, lng) {
    return loadList("mrd.favorites").some((p) => placeKey(p.lat, p.lng) === placeKey(lat, lng));
  }
  function addFav(place) { addToList("mrd.favorites", place, 30); }
  function removeFav(lat, lng) {
    saveList("mrd.favorites", loadList("mrd.favorites").filter(
      (p) => placeKey(p.lat, p.lng) !== placeKey(lat, lng)
    ));
  }

  function shortenAddr(a) {
    const s = (a || "").replace(/^日本、/, "").replace(/〒\d{3}-?\d{4}\s*/, "").trim();
    return s || "地点";
  }

  // 逆ジオコーディングで地点名を後付け（保存済みの履歴/お気に入りを更新）
  function resolvePlaceName(lat, lng) {
    if (!geocoder) return;
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results || !results[0]) return; // 失敗時は座標表示のまま
      const name = shortenAddr(results[0].formatted_address);
      ["mrd.recents", "mrd.favorites"].forEach((key) => {
        const list = loadList(key);
        let changed = false;
        list.forEach((p) => {
          if (placeKey(p.lat, p.lng) === placeKey(lat, lng)) { p.name = name; changed = true; }
        });
        if (changed) saveList(key, list);
      });
    });
  }

  /* ---------- メニュー（上下キーで選択） ---------- */
  function openMenu(title, items) {
    menuItems = items;
    menuIdx = 0;
    menuOpen = true;
    els.menuTitle.textContent = title;
    renderMenu();
    els.menu.classList.remove("hidden");
  }
  function closeMenu() {
    menuOpen = false;
    els.menu.classList.add("hidden");
  }
  function renderMenu() {
    els.menuList.innerHTML = "";
    menuItems.forEach((it, i) => {
      const li = document.createElement("li");
      li.className = "menu-row" + (i === menuIdx ? " focused" : "");
      li.textContent = it.label;
      li.addEventListener("click", () => { menuIdx = i; renderMenu(); it.action(); });
      els.menuList.appendChild(li);
    });
  }
  function menuMove(d) {
    menuIdx = (menuIdx + d + menuItems.length) % menuItems.length;
    renderMenu();
  }
  function menuActivate() {
    const it = menuItems[menuIdx];
    if (it) it.action();
  }
  function menuBack() {
    const back = menuItems.find((it) => it.label.indexOf("←") === 0);
    if (back) back.action();
    else closeMenu();
  }

  function travelLabel() {
    return { WALKING: "徒歩", DRIVING: "自動車", BICYCLING: "自転車", TRANSIT: "公共交通" }[travelMode];
  }

  function openDestinationMenu() {
    const items = [];
    items.push({ label: "🔍 場所を検索", action: openSearch });
    items.push({ label: "📍 地図で目的地を選ぶ", action: () => { closeMenu(); enterPickMode(); } });
    const fav = loadList("mrd.favorites");
    const rec = loadList("mrd.recents");
    if (fav.length) items.push({ label: `⭐ お気に入り (${fav.length})`, action: () => openListMenu("mrd.favorites", "お気に入り") });
    if (rec.length) items.push({ label: `🕘 最近の目的地 (${rec.length})`, action: () => openListMenu("mrd.recents", "最近の目的地") });
    items.push({ label: `🚶 移動手段: ${travelLabel()}`, action: openTravelMenu });
    if (navMode && navDestination) {
      items.push({ label: "🗺 ルート全体を表示", action: () => { if (navBounds) map.fitBounds(navBounds); followMode = false; closeMenu(); } });
      items.push({ label: "📋 ルート一覧", action: openStepList });
      items.push({
        label: `🚥 信号表示: ${signalsOn ? "ON" : "OFF"}`,
        action: () => {
          signalsOn = !signalsOn;
          if (signalsOn && !signalData.length) fetchSignals();
          else plotSignals();
          closeMenu();
        },
      });
      const lat = navDestination.lat(), lng = navDestination.lng();
      if (isFav(lat, lng)) {
        items.push({ label: "⭐ お気に入りから削除", action: () => { removeFav(lat, lng); closeMenu(); } });
      } else {
        items.push({ label: "⭐ この目的地をお気に入り登録", action: () => { addFav({ name: placeKey(lat, lng), lat, lng }); resolvePlaceName(lat, lng); closeMenu(); } });
      }
      items.push({ label: "⏹ ナビを終了", action: () => { cancelNav(); closeMenu(); } });
    }
    items.push({ label: "← 戻る", action: closeMenu });
    openMenu("目的地", items);
  }

  function openStepList() {
    const items = navSteps.map((s, i) => ({
      label: `${i + 1}. ${stripHtml(s.instructions)} (${s.distance ? s.distance.text : ""})`,
      action: () => { followMode = false; map.panTo(s.start_location); closeMenu(); },
    }));
    items.push({ label: "← 戻る", action: openDestinationMenu });
    openMenu("ルート一覧", items);
  }

  function openListMenu(key, title) {
    const list = loadList(key);
    const items = list.map((p) => ({
      label: p.name,
      action: () => { closeMenu(); computeRoute(new google.maps.LatLng(p.lat, p.lng), false, p.name); },
    }));
    items.push({ label: "← 戻る", action: openDestinationMenu });
    openMenu(title, items);
  }

  function openTravelMenu() {
    const modes = [
      ["WALKING", "🚶 徒歩"], ["DRIVING", "🚗 自動車"],
      ["BICYCLING", "🚲 自転車"], ["TRANSIT", "🚆 公共交通"],
    ];
    const items = modes.map(([m, label]) => ({
      label: (travelMode === m ? "● " : "○ ") + label,
      action: () => {
        if (navMode && navDestination) {
          computeRoute(navDestination, false, undefined, m); // 成功時だけ移動手段を確定
        } else {
          travelMode = m;
        }
        openDestinationMenu();
      },
    }));
    items.push({ label: "← 戻る", action: openDestinationMenu });
    openMenu("移動手段", items);
  }

  /* ---------- 場所検索（オンスクリーンキーボード＋Autocomplete） ---------- */
  function openSearch() {
    closeMenu();
    if (!autocompleteService) autocompleteService = new google.maps.places.AutocompleteService();
    if (!placesService) placesService = new google.maps.places.PlacesService(map);
    searchToken = new google.maps.places.AutocompleteSessionToken();
    searchOpen = true;
    searchQuery = "";
    searchPredictions = [];
    searchZone = "keys";
    keyIdx = 0;
    predIdx = 0;
    els.search.classList.remove("hidden");
    renderSearch();
  }

  function closeSearch() {
    predictionRequestId++; // 閉じた検索の callback が後から UI を更新しないよう無効化
    placeDetailsRequestId++; // 閉じた検索の Place Details callback も無効化
    searchOpen = false;
    els.search.classList.add("hidden");
  }

  function renderSearch() {
    els.searchQuery.textContent = searchQuery || "（A〜Zで入力 → 候補を選択）";
    els.searchKeyboard.innerHTML = "";
    SEARCH_KEYS.forEach((k, i) => {
      const d = document.createElement("div");
      d.className = "key" + (searchZone === "keys" && i === keyIdx ? " focused" : "");
      d.textContent = k;
      d.addEventListener("click", () => { searchZone = "keys"; keyIdx = i; pressKey(k); });
      els.searchKeyboard.appendChild(d);
    });
    els.searchPreds.innerHTML = "";
    searchPredictions.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "pred" + (searchZone === "preds" && i === predIdx ? " focused" : "");
      li.textContent = p.description;
      li.addEventListener("click", () => { searchZone = "preds"; predIdx = i; selectPrediction(p); });
      els.searchPreds.appendChild(li);
    });
  }

  function pressKey(k) {
    if (k === "✕") { closeSearch(); return; }
    if (k === "⌫") searchQuery = searchQuery.slice(0, -1);
    else if (k === "␣") searchQuery += " ";
    else searchQuery += k;
    refreshPredictions();
    renderSearch();
  }

  function refreshPredictions() {
    const requestId = ++predictionRequestId;
    const q = searchQuery.trim();
    if (q.length < 1) { searchPredictions = []; return; }
    const req = {
      input: q,
      sessionToken: searchToken,
      componentRestrictions: { country: "jp" },
    };
    const pos = userMarker && userMarker.getPosition();
    if (pos) { req.location = pos; req.radius = 50000; }
    autocompleteService.getPlacePredictions(req, (preds, status) => {
      if (requestId !== predictionRequestId || !searchOpen) return;
      searchPredictions = status === "OK" && preds ? preds.slice(0, 6) : [];
      if (predIdx >= searchPredictions.length) predIdx = 0;
      renderSearch();
    });
  }

  function selectPrediction(p) {
    if (!p) return;
    const requestId = ++placeDetailsRequestId;
    placesService.getDetails(
      { placeId: p.place_id, fields: ["geometry"], sessionToken: searchToken },
      (res, status) => {
        if (requestId !== placeDetailsRequestId || !searchOpen) return;
        searchToken = new google.maps.places.AutocompleteSessionToken(); // セッション更新
        if (status === "OK" && res && res.geometry && res.geometry.location) {
          closeSearch();
          computeRoute(res.geometry.location, false, p.description);
        } else {
          showError("場所を取得できません", `ステータス: <code>${status}</code>`);
        }
      }
    );
  }

  // 検索画面のキー操作
  function searchKeydown(key) {
    if (searchZone === "keys") {
      switch (key) {
        case "ArrowLeft":  keyIdx = Math.max(0, keyIdx - 1); break;
        case "ArrowRight": keyIdx = Math.min(SEARCH_KEYS.length - 1, keyIdx + 1); break;
        case "ArrowUp":    if (keyIdx - SEARCH_COLS >= 0) keyIdx -= SEARCH_COLS; break;
        case "ArrowDown":
          if (keyIdx + SEARCH_COLS < SEARCH_KEYS.length) keyIdx += SEARCH_COLS;
          else if (searchPredictions.length) { searchZone = "preds"; predIdx = 0; }
          break;
        case "Enter": case " ": pressKey(SEARCH_KEYS[keyIdx]); return;
        default: return;
      }
    } else {
      switch (key) {
        case "ArrowUp":   if (predIdx > 0) predIdx--; else searchZone = "keys"; break;
        case "ArrowDown": predIdx = Math.min(searchPredictions.length - 1, predIdx + 1); break;
        case "ArrowLeft": searchZone = "keys"; break;
        case "Enter": case " ": selectPrediction(searchPredictions[predIdx]); return;
        default: return;
      }
    }
    renderSearch();
  }

  function enterPickMode() {
    if (compassOn) disableCompass(); // 回転中はパン方向が分かりにくいので解除
    pickMode = true;
    followMode = false;
    els.picker.classList.remove("hidden");
    setNavBanner("←↑↓→ で地図を動かし、決定で目的地を確定");
  }

  function exitPickMode() {
    pickMode = false;
    els.picker.classList.add("hidden");
    if (!navMode) setNavBanner(null);
  }

  function confirmDestination() {
    const dest = map.getCenter();
    exitPickMode();
    computeRoute(dest);
  }

  function computeRoute(dest, isReroute, name, requestedTravelMode) {
    const origin = userMarker.getPosition();
    if (!origin) {
      showError("現在地が未取得", "先に ◎ で現在地を取得してください。");
      return;
    }
    const requestId = ++routeRequestId;
    const routeTravelMode = requestedTravelMode || travelMode;
    navRerouting = true; // 経路要求中は既存ルートからの自動リルートを抑止
    const previousNavBanner = navMode && !els.navBanner.classList.contains("hidden")
      ? els.navBanner.innerHTML
      : null;
    setNavBanner(isReroute ? "ルートを再計算中…" : "経路を計算中…");
    directionsService.route(
      { origin, destination: dest, travelMode: google.maps.TravelMode[routeTravelMode] },
      (res, status) => {
        if (requestId !== routeRequestId) return;
        navRerouting = false;
        if (status === "OK" && res.routes[0]) {
          travelMode = routeTravelMode;
          navDestination = dest;
          clearRoute();
          directionsRenderer = new google.maps.DirectionsRenderer({
            map,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: "#4dd6a0", strokeOpacity: 0.9, strokeWeight: 6 },
          });
          directionsRenderer.setDirections(res);
          navSteps = res.routes[0].legs[0].steps || [];
          navStepIdx = 0;
          offRouteCount = 0;
          navBounds = res.routes[0].bounds || null;
          zoomedForTurn = false;
          // オフルート判定用に詳細経路点を平坦化
          navFullPath = [];
          navSteps.forEach((s) => {
            const path = (s.path && s.path.length ? s.path : [s.start_location, s.end_location]);
            navFullPath.push(...path);
          });
          navMode = true;
          followMode = true;
          if (!isReroute) {
            map.setZoom(routeTravelMode === "DRIVING" ? 17 : 18);
            saveRecent(dest, name); // 履歴に保存（名前があれば優先、無ければ逆ジオコーディング）
          }
          signalRequestId++; // 前ルートの未完了 Overpass callback を無効化
          clearSignals();
          signalData = [];
          if (signalsOn) fetchSignals(); // ルート周辺の信号機を取得
          updateNav({ lat: origin.lat(), lng: origin.lng() });
        } else if (status === "REQUEST_DENIED") {
          showError(
            "経路を取得できません",
            "ステータス: <code>REQUEST_DENIED</code><br>" +
            "APIキーの「APIの制限」に <b>Directions API</b> を追加してください。"
          );
          setNavBanner(previousNavBanner);
        } else {
          showError("経路を取得できません", `ステータス: <code>${status}</code>`);
          setNavBanner(previousNavBanner);
        }
      }
    );
  }

  function clearRoute() {
    if (directionsRenderer) {
      directionsRenderer.setMap(null);
      directionsRenderer = null;
    }
  }

  function cancelNav() {
    routeRequestId++; // 未完了の Directions callback でナビが復活しないよう無効化
    signalRequestId++; // 未完了の Overpass callback で信号が復活しないよう無効化
    navRerouting = false;
    navMode = false;
    navSteps = [];
    navFullPath = [];
    navDestination = null;
    clearRoute();
    clearSignals();
    signalData = [];
    setNavBanner(null);
  }

  /* ---------- 信号機（OpenStreetMap Overpass・無料/キー不要） ---------- */
  function fetchSignals() {
    if (!navBounds || !navFullPath.length) return;
    const requestId = ++signalRequestId;
    const sw = navBounds.getSouthWest(), ne = navBounds.getNorthEast();
    const q =
      `[out:json][timeout:20];node["highway"="traffic_signals"]` +
      `(${sw.lat()},${sw.lng()},${ne.lat()},${ne.lng()});out;`;
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(q),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (requestId !== signalRequestId || !navMode) return;
        if (!j || !j.elements) return;
        const near = [];
        for (const el of j.elements) {
          if (near.length > 200) break;
          const pt = new google.maps.LatLng(el.lat, el.lon);
          let min = Infinity;
          for (let i = 0; i < navFullPath.length; i++) {
            const d = meters(pt, navFullPath[i]);
            if (d < min) min = d;
            if (min < 25) break;
          }
          if (min < 25) near.push({ lat: el.lat, lng: el.lon }); // ルート沿いのみ
        }
        signalData = near;
        plotSignals();
      })
      .catch(() => {}); // 取得失敗は無視（ベストエフォート）
  }

  function plotSignals() {
    clearSignals();
    if (!signalsOn) return;
    signalData.forEach((s) => {
      signalMarkers.push(
        new google.maps.Marker({
          map,
          position: { lat: s.lat, lng: s.lng },
          clickable: false,
          title: "信号",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#ff8c1a",
            fillOpacity: 1,
            strokeColor: "#000000",
            strokeWeight: 1,
          },
        })
      );
    });
  }

  function clearSignals() {
    signalMarkers.forEach((m) => m.setMap(null));
    signalMarkers = [];
  }

  function meters(a, b) {
    return google.maps.geometry.spherical.computeDistanceBetween(a, b);
  }

  function fmtDist(m) {
    return m >= 1000 ? (m / 1000).toFixed(1) + "km" : Math.round(m) + "m";
  }

  function fmtMin(sec) {
    const min = Math.max(1, Math.round(sec / 60));
    return min >= 60 ? `${Math.floor(min / 60)}時間${min % 60}分` : `約${min}分`;
  }

  function stripHtml(html) {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return d.textContent || "進む";
  }

  // 曲がり角の種類 → 大きな方向アイコン
  function maneuverArrow(m) {
    if (!m) return "⬆";
    if (m === "arrive") return "🏁";
    if (m.indexOf("uturn") === 0) return "⤵";
    if (m.indexOf("slight-left") >= 0) return "↖";
    if (m.indexOf("slight-right") >= 0) return "↗";
    if (m.indexOf("sharp-left") >= 0) return "⬅";
    if (m.indexOf("sharp-right") >= 0) return "➡";
    if (m.indexOf("left") >= 0) return "⬅";
    if (m.indexOf("right") >= 0) return "➡";
    return "⬆"; // straight / merge / depart / continue
  }

  // 残り距離・時間（現在地から終点まで）
  function remaining(here) {
    let dist = meters(here, navSteps[navStepIdx].end_location);
    let sec = 0;
    const cur = navSteps[navStepIdx];
    const curDist = cur.distance ? cur.distance.value : dist;
    const curSec = cur.duration ? cur.duration.value : 0;
    sec += curDist > 0 ? curSec * Math.min(1, dist / curDist) : 0;
    for (let i = navStepIdx + 1; i < navSteps.length; i++) {
      dist += navSteps[i].distance ? navSteps[i].distance.value : 0;
      sec += navSteps[i].duration ? navSteps[i].duration.value : 0;
    }
    return { dist, sec };
  }

  // 位置更新ごとに「次の曲がり角」と残り・オフルートを更新
  function updateNav(p) {
    if (!navMode || !navSteps.length) return;
    const here = new google.maps.LatLng(p.lat, p.lng);

    // 通過した手順を進める
    while (navStepIdx < navSteps.length - 1 && meters(here, navSteps[navStepIdx].end_location) < 25) {
      navStepIdx++;
    }
    const step = navSteps[navStepIdx];
    const d = meters(here, step.end_location);
    const isLast = navStepIdx === navSteps.length - 1;

    if (isLast && d < 20) {
      setNavBanner('<div class="nav-main"><span class="nav-arrow">🏁</span> 目的地に到着</div>');
      return;
    }

    const rem = remaining(here);
    setNavBanner(
      `<div class="nav-main"><span class="nav-arrow">${maneuverArrow(step.maneuver)}</span> ` +
      `<span class="nav-dist">${fmtDist(d)}</span></div>` +
      `<div class="nav-sub">${stripHtml(step.instructions)}` +
      ` ・ 残り ${fmtDist(rem.dist)} ${fmtMin(rem.sec)} ・ ${arrivalClock(rem.sec)}着</div>`
    );

    if (followMode) autoZoomForTurn(d, isLast); // 全体表示中は自動ズームしない
    rerouteIfOffRoute(here);
  }

  // 到着予想時刻（現在時刻 + 残り秒）
  function arrivalClock(sec) {
    const t = new Date(Date.now() + sec * 1000);
    const p = (n) => (n < 10 ? "0" + n : "" + n);
    return p(t.getHours()) + ":" + p(t.getMinutes());
  }

  // 曲がり角が近いと自動でズームイン、離れたら戻す（ヒステリシスでばたつき防止）
  function autoZoomForTurn(d, isLast) {
    const base = travelMode === "DRIVING" ? 17 : 18;
    if (!isLast && d < 40) {
      if (!zoomedForTurn) { zoomedForTurn = true; map.setZoom(19); }
    } else if (d > 60 || isLast) {
      if (zoomedForTurn) { zoomedForTurn = false; map.setZoom(base); }
    }
  }

  // ルートから外れ続けたら現在地から再計算
  function rerouteIfOffRoute(here) {
    if (navRerouting || !navFullPath.length || !navDestination) return;
    let min = Infinity;
    for (let i = 0; i < navFullPath.length; i++) {
      const dd = meters(here, navFullPath[i]);
      if (dd < min) min = dd;
    }
    if (min > 35) {
      offRouteCount++;
      if (offRouteCount >= 3) {
        offRouteCount = 0;
        computeRoute(navDestination, true);
      }
    } else {
      offRouteCount = 0;
    }
  }

  function onPosition(pos) {
    els.error.classList.add("hidden"); // 取得できたらエラー/取得中の案内を消す
    const { latitude, longitude, accuracy } = pos.coords;
    const p = { lat: latitude, lng: longitude };
    userMarker.setPosition(p);
    accuracyCircle.setCenter(p);
    accuracyCircle.setRadius(accuracy || 0);
    setGps(true, "GPS");
    els.accText.textContent = accuracy ? `±${Math.round(accuracy)}m` : "";
    if (followMode && !pickMode) map.panTo(p); // 目的地選択中は追従しない
    if (navMode) updateNav(p);
  }

  function onGeoError(err) {
    setGps(false, "GPS不可");
    els.accText.textContent = "";
    const code = err && err.code;
    let body;
    if (code === 1) {
      // PERMISSION_DENIED: グラスではユーザー操作起点で許可を出す必要がある
      body = "◎ を決定して、表示される許可を承認してください。";
    } else if (code === 3) {
      body = "現在地の取得に時間がかかっています。◎ を決定で再取得してください。";
    } else {
      body = "現在地を特定できません。屋外/窓際で ◎ を決定して再取得してください。";
    }
    showError("位置情報を取得できません", body + "<br><br>◎ 再取得 / ↻ 再読み込み");
  }

  function setGps(on, text) {
    els.gpsDot.classList.toggle("off", !on);
    if (!compassOn) els.gpsText.textContent = text; // コンパス中は方位表示を優先
  }

  /* ---------- アクション ---------- */
  function doAction(action) {
    if (action === "retry") { location.reload(); return; } // 地図未初期化でも効くよう先頭で処理
    if (!map) return;
    switch (action) {
      case "zoom-in":
        map.setZoom(map.getZoom() + 1);
        break;
      case "zoom-out":
        map.setZoom(map.getZoom() - 1);
        break;
      case "recenter":
        followMode = true;
        if (userMarker.getPosition()) {
          map.panTo(userMarker.getPosition());
        } else {
          els.error.classList.add("hidden"); // 前回エラー表示を消す
          acquireLocation(); // ★ユーザー操作の中で位置情報を要求（プロンプト通過のため）
        }
        break;
      case "toggle-pan":
        setPanMode(!panMode);
        break;
      case "toggle-compass":
        toggleCompass();
        break;
      case "toggle-nav":
        toggleNav();
        break;
    }
  }

  function setPanMode(on) {
    panMode = on;
    els.app.classList.toggle("pan-mode", on);
    if (on) followMode = false;
  }

  /* ---------- D-pad / フォーカス管理 ---------- */
  const focusables = Array.from(document.querySelectorAll(".focusable"));
  let focusIdx = 1; // 初期フォーカスは「現在地(◎)」

  function renderFocus() {
    focusables.forEach((el, i) => el.classList.toggle("focused", i === focusIdx));
  }

  function moveFocus(delta) {
    focusIdx = (focusIdx + delta + focusables.length) % focusables.length;
    renderFocus();
  }

  const PAN_STEP = 80; // px

  document.addEventListener("keydown", (e) => {
    // 検索画面: キーボード/候補を操作
    if (searchOpen) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].indexOf(e.key) >= 0) {
        searchKeydown(e.key);
        e.preventDefault();
      }
      return;
    }

    // メニュー表示中: 上下で選択、決定で実行、← で戻る
    if (menuOpen) {
      switch (e.key) {
        case "ArrowUp":   menuMove(-1); break;
        case "ArrowDown": menuMove(1); break;
        case "ArrowLeft": menuBack(); break;
        case "Enter": case " ": menuActivate(); break;
        default: return;
      }
      e.preventDefault();
      return;
    }

    // 目的地選択モード: 矢印で地図移動、決定で中央を目的地に確定
    if (pickMode) {
      switch (e.key) {
        case "ArrowLeft":  map && map.panBy(-PAN_STEP, 0); break;
        case "ArrowRight": map && map.panBy(PAN_STEP, 0); break;
        case "ArrowUp":    map && map.panBy(0, -PAN_STEP); break;
        case "ArrowDown":  map && map.panBy(0, PAN_STEP); break;
        case "Enter": case " ": confirmDestination(); break;
        default: return;
      }
      e.preventDefault();
      return;
    }

    if (panMode) {
      switch (e.key) {
        case "ArrowLeft":  map && map.panBy(-PAN_STEP, 0); break;
        case "ArrowRight": map && map.panBy(PAN_STEP, 0); break;
        case "ArrowUp":    map && map.panBy(0, -PAN_STEP); break;
        case "ArrowDown":  map && map.panBy(0, PAN_STEP); break;
        case "Enter": case " ": setPanMode(false); break;
        default: return;
      }
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case "ArrowLeft":  moveFocus(-1); break;
      case "ArrowRight": moveFocus(1); break;
      case "Enter": case " ":
        doAction(focusables[focusIdx].dataset.action);
        break;
      default: return;
    }
    e.preventDefault();
  });

  // マウス/タップでも動くようにしておく（Chrome での開発用）
  focusables.forEach((el, i) => {
    el.addEventListener("click", () => {
      focusIdx = i;
      renderFocus();
      doAction(el.dataset.action);
    });
  });

  /* ---------- 起動 ---------- */
  renderFocus();
  loadGoogleMaps()
    .then(initMap)
    .catch((err) => showError("地図の読み込みに失敗", String(err.message || err)));
})();
