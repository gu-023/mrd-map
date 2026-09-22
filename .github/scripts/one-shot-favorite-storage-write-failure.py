from pathlib import Path

path = Path("js/app.js")
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)


replace_once(
'''  function saveList(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function placeKey(lat, lng) { return lat.toFixed(4) + "," + lng.toFixed(4); }
''',
'''  function saveList(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (e) {
      return false;
    }
  }
  function showFavoriteStorageError() {
    showError(
      "お気に入りを更新できません",
      "端末ストレージへの保存に失敗しました。<br><br>決定で閉じる",
      "storage"
    );
  }
  function placeKey(lat, lng) { return lat.toFixed(4) + "," + lng.toFixed(4); }
''',
"saveList",
)

replace_once(
'''    if (list.length > cap) list.length = cap;
    saveList(key, list);
  }
''',
'''    if (list.length > cap) list.length = cap;
    return saveList(key, list);
  }
''',
"addToList return",
)

replace_once(
'''  function addFav(place) { addToList("mrd.favorites", place, 30); }
  function removeFav(lat, lng) {
    saveList("mrd.favorites", loadList("mrd.favorites").filter(
      (p) => placeKey(p.lat, p.lng) !== placeKey(lat, lng)
    ));
  }
''',
'''  function addFav(place) { return addToList("mrd.favorites", place, 30); }
  function removeFav(lat, lng) {
    return saveList("mrd.favorites", loadList("mrd.favorites").filter(
      (p) => placeKey(p.lat, p.lng) !== placeKey(lat, lng)
    ));
  }
''',
"favorite write result",
)

replace_once(
'''      if (isFav(lat, lng)) {
        items.push({ label: "⭐ お気に入りから削除", action: () => { removeFav(lat, lng); closeMenuToMap(); } });
      } else {
        items.push({ label: "⭐ この目的地をお気に入り登録", action: () => { addFav({ name: placeKey(lat, lng), lat, lng }); resolvePlaceName(lat, lng); closeMenuToMap(); } });
      }
''',
'''      if (isFav(lat, lng)) {
        items.push({
          label: "⭐ お気に入りから削除",
          action: () => {
            const saved = removeFav(lat, lng);
            closeMenuToMap();
            if (!saved) showFavoriteStorageError();
          },
        });
      } else {
        items.push({
          label: "⭐ この目的地をお気に入り登録",
          action: () => {
            const saved = addFav({ name: placeKey(lat, lng), lat, lng });
            if (saved) resolvePlaceName(lat, lng);
            closeMenuToMap();
            if (!saved) showFavoriteStorageError();
          },
        });
      }
''',
"favorite menu actions",
)

replace_once(
'''    if (googleMapsAuthFailed) {
      if (e.key === "Enter" || e.key === " ") location.reload();
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].indexOf(e.key) >= 0) {
        e.preventDefault();
      }
      return;
    }

    // 検索画面: キーボード/候補を操作
''',
'''    if (googleMapsAuthFailed) {
      if (e.key === "Enter" || e.key === " ") location.reload();
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].indexOf(e.key) >= 0) {
        e.preventDefault();
      }
      return;
    }

    if (errorSource === "storage") {
      if (e.key === "Enter" || e.key === " ") clearError("storage");
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].indexOf(e.key) >= 0) {
        e.preventDefault();
      }
      return;
    }

    // 検索画面: キーボード/候補を操作
''',
"storage error D-pad dismissal",
)

path.write_text(text)

required = [
    'return saveList(key, list);',
    'function showFavoriteStorageError()',
    'if (!saved) showFavoriteStorageError();',
    'if (errorSource === "storage")',
    'if (saved) resolvePlaceName(lat, lng);',
]
for snippet in required:
    if snippet not in text:
        raise SystemExit(f"missing expected post-patch snippet: {snippet}")
