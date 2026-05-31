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
        `&callback=__mrdMapInit&libraries=marker&loading=async&language=ja&region=JP`;
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

  function onPosition(pos) {
    els.error.classList.add("hidden"); // 取得できたらエラー/取得中の案内を消す
    const { latitude, longitude, accuracy } = pos.coords;
    const p = { lat: latitude, lng: longitude };
    userMarker.setPosition(p);
    accuracyCircle.setCenter(p);
    accuracyCircle.setRadius(accuracy || 0);
    setGps(true, "GPS");
    els.accText.textContent = accuracy ? `±${Math.round(accuracy)}m` : "";
    if (followMode) map.panTo(p);
  }

  function onGeoError(err) {
    setGps(false, "GPS不可");
    els.accText.textContent = "";
    // 実機にはコンソールが無いので、原因切り分け情報を画面に出す。
    const codeName =
      { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" }[err && err.code] ||
      "UNKNOWN";
    const msg = (err && err.message) ? err.message : "(メッセージなし)";
    // ホストが別オリジン iframe に埋め込んでいると位置情報は既定で遮断される
    let framed;
    try {
      framed = window.self !== window.top ? "iframe内" : "トップレベル";
    } catch (e) {
      framed = "iframe内(別オリジン)";
    }
    showError(
      "位置情報を取得できません",
      `コード: <code>${codeName}</code><br>` +
      `詳細: <code>${msg}</code><br>` +
      `埋め込み: <code>${framed}</code><br>` +
      `許可状態: <code id="perm-state">確認中…</code><br>` +
      `◎ を決定で再取得 / ↻ で再読み込み`
    );
    // Permissions API で実際の許可状態を確認（granted / denied / prompt）
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((p) => {
          const el = document.getElementById("perm-state");
          if (el) el.textContent = p.state;
        })
        .catch(() => {
          const el = document.getElementById("perm-state");
          if (el) el.textContent = "(query不可)";
        });
    } else {
      const el = document.getElementById("perm-state");
      if (el) el.textContent = "(API無し)";
    }
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
