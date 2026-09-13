from pathlib import Path

path = Path("js/app.js")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one source anchor, found {count}")
    source = source.replace(old, new, 1)


replace_once(
    "  let compassPermissionPending = false;\n  let compassStreamSilenceTimer = null;",
    "  let compassPermissionPending = false;\n  let compassFirstReadingTimer = null;\n  let compassStreamSilenceTimer = null;",
    "compass timer state",
)

replace_once(
    """      setTimeout(() => {
        if (!isCurrentRequest() || !compassOn || headingInitialized) return;
        disableCompass();
        showError(\"方位センサーが応答しません\", \"🧭 を決定で再試行してください。\", \"compass\");
      }, COMPASS_FIRST_READING_TIMEOUT_MS);""",
    "      armCompassFirstReadingWatchdog();",
    "first-reading timeout call",
)

replace_once(
    "  function armCompassStreamWatchdog() {",
    """  function armCompassFirstReadingWatchdog() {
    if (compassFirstReadingTimer !== null) clearTimeout(compassFirstReadingTimer);
    compassFirstReadingTimer = null;
    if (document.visibilityState === \"hidden\") return;
    const requestId = compassPermissionRequestId;
    compassFirstReadingTimer = setTimeout(() => {
      compassFirstReadingTimer = null;
      if (document.visibilityState === \"hidden\") return;
      if (requestId !== compassPermissionRequestId || !compassOn || headingInitialized) return;
      disableCompass();
      showError(\"方位センサーが応答しません\", \"🧭 を決定で再試行してください。\", \"compass\");
    }, COMPASS_FIRST_READING_TIMEOUT_MS);
  }

  function armCompassStreamWatchdog() {""",
    "first-reading watchdog helper",
)

replace_once(
    """  document.addEventListener(\"visibilitychange\", () => {
    if (!compassOn || !headingInitialized) return;
    if (document.visibilityState === \"hidden\") {
      if (compassStreamSilenceTimer !== null) {
        clearTimeout(compassStreamSilenceTimer);
        compassStreamSilenceTimer = null;
      }
      return;
    }
    armCompassStreamWatchdog();
  });""",
    """  document.addEventListener(\"visibilitychange\", () => {
    if (!compassOn) return;
    if (document.visibilityState === \"hidden\") {
      if (headingInitialized && compassStreamSilenceTimer !== null) {
        clearTimeout(compassStreamSilenceTimer);
        compassStreamSilenceTimer = null;
      } else if (!headingInitialized && compassFirstReadingTimer !== null) {
        clearTimeout(compassFirstReadingTimer);
        compassFirstReadingTimer = null;
      }
      return;
    }
    if (headingInitialized) armCompassStreamWatchdog();
    else armCompassFirstReadingWatchdog();
  });""",
    "visibility watchdog handling",
)

replace_once(
    """    compassPermissionRequestId += 1;
    compassPermissionPending = false;
    if (compassStreamSilenceTimer !== null) {""",
    """    compassPermissionRequestId += 1;
    compassPermissionPending = false;
    if (compassFirstReadingTimer !== null) {
      clearTimeout(compassFirstReadingTimer);
      compassFirstReadingTimer = null;
    }
    if (compassStreamSilenceTimer !== null) {""",
    "disable first-reading watchdog cleanup",
)

replace_once(
    """    armCompassStreamWatchdog();
    if (!headingInitialized) {""",
    """    if (!headingInitialized && compassFirstReadingTimer !== null) {
      clearTimeout(compassFirstReadingTimer);
      compassFirstReadingTimer = null;
    }
    armCompassStreamWatchdog();
    if (!headingInitialized) {""",
    "first heading watchdog cleanup",
)

required = [
    "let compassFirstReadingTimer = null;",
    "function armCompassFirstReadingWatchdog()",
    "if (headingInitialized) armCompassStreamWatchdog();",
    "else armCompassFirstReadingWatchdog();",
]
for token in required:
    if token not in source:
        raise SystemExit(f"missing expected final token: {token}")

path.write_text(source, encoding="utf-8")
