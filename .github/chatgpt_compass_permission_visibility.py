from pathlib import Path

path = Path("js/app.js")
text = path.read_text()

replacements = [
    (
        '  let compassPermissionPending = false;\n  let compassFirstReadingTimer = null;',
        '  let compassPermissionPending = false;\n  let compassPermissionTimer = null;\n  let compassFirstReadingTimer = null;',
    ),
    (
        '      compassPermissionPending = true;\n      setTimeout(() => {\n        if (!isCurrentRequest() || !compassPermissionPending) return;\n        compassPermissionPending = false;\n        compassPermissionRequestId += 1;\n        showError("方位センサーが応答しません", "🧭 を決定で再試行してください。", "compass");\n      }, COMPASS_PERMISSION_PENDING_TIMEOUT_MS);\n      try {',
        '      compassPermissionPending = true;\n      armCompassPermissionWatchdog();\n      try {',
    ),
    (
        '            compassPermissionPending = false;\n            if (state === "granted") start();',
        '            compassPermissionPending = false;\n            clearCompassPermissionWatchdog();\n            if (state === "granted") start();',
    ),
    (
        '            compassPermissionPending = false;\n            showError("方位センサーを開始できません", "🧭 を決定で再試行。", "compass");',
        '            compassPermissionPending = false;\n            clearCompassPermissionWatchdog();\n            showError("方位センサーを開始できません", "🧭 を決定で再試行。", "compass");',
    ),
    (
        '        compassPermissionPending = false;\n        showError("方位センサーを開始できません", "🧭 を決定で再試行。", "compass");',
        '        compassPermissionPending = false;\n        clearCompassPermissionWatchdog();\n        showError("方位センサーを開始できません", "🧭 を決定で再試行。", "compass");',
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one source anchor, found {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)

anchor = '  function armCompassFirstReadingWatchdog() {'
if text.count(anchor) != 1:
    raise SystemExit("first-reading watchdog anchor is not unique")
helper = '''  function clearCompassPermissionWatchdog() {
    if (compassPermissionTimer === null) return;
    clearTimeout(compassPermissionTimer);
    compassPermissionTimer = null;
  }

  function armCompassPermissionWatchdog() {
    clearCompassPermissionWatchdog();
    if (!compassPermissionPending || document.visibilityState === "hidden") return;
    const requestId = compassPermissionRequestId;
    compassPermissionTimer = setTimeout(() => {
      compassPermissionTimer = null;
      if (document.visibilityState === "hidden") return;
      if (requestId !== compassPermissionRequestId || !compassPermissionPending) return;
      compassPermissionPending = false;
      compassPermissionRequestId += 1;
      showError("方位センサーが応答しません", "🧭 を決定で再試行してください。", "compass");
    }, COMPASS_PERMISSION_PENDING_TIMEOUT_MS);
  }

'''
text = text.replace(anchor, helper + anchor, 1)

old_visibility = '  document.addEventListener("visibilitychange", () => {\n    if (!compassOn) return;'
new_visibility = '  document.addEventListener("visibilitychange", () => {\n    if (compassPermissionPending) {\n      if (document.visibilityState === "hidden") clearCompassPermissionWatchdog();\n      else armCompassPermissionWatchdog();\n      return;\n    }\n    if (!compassOn) return;'
if text.count(old_visibility) != 1:
    raise SystemExit("visibilitychange anchor is not unique")
text = text.replace(old_visibility, new_visibility, 1)

old_disable = '    compassPermissionRequestId += 1;\n    compassPermissionPending = false;\n    if (compassFirstReadingTimer !== null) {'
new_disable = '    compassPermissionRequestId += 1;\n    compassPermissionPending = false;\n    clearCompassPermissionWatchdog();\n    if (compassFirstReadingTimer !== null) {'
if text.count(old_disable) != 1:
    raise SystemExit("disableCompass anchor is not unique")
text = text.replace(old_disable, new_disable, 1)

path.write_text(text)

required = [
    "let compassPermissionTimer = null;",
    "function clearCompassPermissionWatchdog()",
    "function armCompassPermissionWatchdog()",
    'if (!compassPermissionPending || document.visibilityState === "hidden") return;',
    'if (document.visibilityState === "hidden") clearCompassPermissionWatchdog();',
    "else armCompassPermissionWatchdog();",
]
for needle in required:
    if needle not in text:
        raise SystemExit(f"missing expected guard: {needle}")
if text.count("COMPASS_PERMISSION_PENDING_TIMEOUT_MS") != 2:
    raise SystemExit("permission timeout should appear only in the constant and watchdog")
if 'compassPermissionPending = true;\n      setTimeout(() =>' in text:
    raise SystemExit("legacy unmanaged permission timeout remains")
