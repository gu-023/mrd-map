# Ray-Ban Display real-device smoke test

Use this checklist before treating a build as release-candidate quality on a physical Ray-Ban Display. It is intentionally short enough to run repeatedly after navigation, D-pad, geolocation, compass, search/composer, or lifecycle changes.

## Preconditions

- Run the deployed GitHub Pages build on the glasses, not only desktop Chrome.
- Confirm the display firmware / Meta AI app meet the versions documented in `README.md`.
- Use a Google Maps key configured through the existing deployment Secret. Never paste a key into this checklist, screenshots, issues, or logs.
- Start outdoors or in another location with usable GPS. Keep a known destination within a short walk/drive for routing checks.
- Record the tested `main` commit SHA and device/app versions with the result.

## Pass criteria

A run passes only if every required check below passes. Any crash, stuck overlay, invisible D-pad focus, stale navigation instruction, unexpected route replacement, or unrecoverable sensor/GPS state is a failure even if the app later recovers after reload.

## Checklist

### 1. Cold launch and D-pad baseline

- [ ] Launch the Web App from the glasses.
- [ ] The 600×600 UI appears without clipping or an unexpected browser control overlay.
- [ ] Left/Right moves focus across the main controls predictably.
- [ ] Enter activates only the focused control.
- [ ] Open and close the destination menu using D-pad only; focus never disappears off-screen.

### 2. First GPS permission and retry path

- [ ] Press `◎` once from a fresh launch and grant location access if prompted.
- [ ] A current-location marker appears and the GPS status becomes healthy.
- [ ] Deny/revoke location permission once if the host makes that practical, then use `◎` to retry.
- [ ] A failed attempt does not leave the app permanently believing a continuous watch is active.
- [ ] No unrelated error overlay is cleared by a successful GPS retry.

### 3. Native composer search, fallback input, and destination selection

Run the native-composer path first. Then repeat the input portion with the fallback keyboard if the device/build exposes a way to do so.

- [ ] Open `🔍 場所を検索`; the standard search input is the initial focus target.
- [ ] Activate the search input using the normal Ray-Ban Display interaction. When the host supports it, the native composer accepts voice or handwriting input without requiring the on-screen fallback keyboard.
- [ ] The committed composer text appears in the search field and starts Places prediction loading.
- [ ] `検索中…`, an empty-result state, or predictions are visually distinguishable.
- [ ] When predictions exist, one `↓` from the search input moves directly to the first prediction instead of forcing a trip through the fallback keyboard.
- [ ] From that first prediction, one `↑` returns focus to the standard search input (not the fallback keyboard), so native-composer editing remains the active path.
- [ ] Moving through predictions keeps the focused item visible.
- [ ] Selecting one prediction opens the four-choice travel-mode menu instead of immediately starting a route.
- [ ] The travel-mode menu contains 🚶徒歩 / 🚗自動車 / 🚲自転車 / 🚆公共交通, and initial focus matches the currently selected/default mode rather than always falling back to 徒歩.
- [ ] Choosing a mode starts routing only to the selected prediction and uses that mode; rapid D-pad movement does not resurrect an older Places result.
- [ ] If native composer is unavailable, move from the search input to the on-screen keyboard and enter a short query with D-pad only.
- [ ] On the fallback keyboard, horizontal movement stays within the visible row, vertical movement matches the displayed geometry, and predictions can still be selected normally.
- [ ] Enter the prediction list from the fallback keyboard, then press `↑` on the first prediction; focus returns to the fallback keyboard rather than jumping to the standard search input.

### 4. Route start and normal guidance

- [ ] A successful route recenters on the latest GPS position and shows the first usable instruction.
- [ ] Turn distance decreases plausibly along curved road geometry rather than behaving like straight-line distance.
- [ ] Remaining route distance / ETA do not jump backward without a genuine reroute or GPS relocation.
- [ ] Approaching a turn changes zoom only when appropriate and restores normal zoom afterward.
- [ ] Arrival stays in the arrived state until navigation is ended or a new route is started.

### 5. D-pad overlay isolation during navigation

While navigation is active:

- [ ] Open the destination menu and wait for at least one GPS update; the underlying navigation banner/step does not advance behind the menu.
- [ ] Open search and wait; no automatic reroute or route replacement occurs behind search.
- [ ] Enter map destination-picker mode and pan with the D-pad; GPS updates do not fight the picker.
- [ ] Return directly to the map from each overlay; if follow mode was active, the map recenters on the latest known marker without waiting for another fix.

### 6. Off-route and reroute behavior

- [ ] Move clearly off the route far enough to exceed the normal tolerance.
- [ ] A single low-accuracy fix does not immediately force a reroute.
- [ ] Confirmed off-route movement eventually triggers rerouting.
- [ ] During rerouting the progress banner remains stable; old-route guidance does not overwrite it.
- [ ] A failed reroute leaves the previous usable route/instruction visible and recoverable.

### 7. Compass start, stop, and sensor loss

- [ ] Enable compass using the D-pad and grant permission if prompted.
- [ ] Heading-up rotation follows physical turns without obvious event-rate-dependent lag or jitter.
- [ ] High-frequency heading changes remain visually smooth without excessive UI redraw/stutter.
- [ ] Disable compass; the map returns to north-up and the latest GPS status text is restored.
- [ ] If sensor access can be interrupted, a stopped orientation stream eventually produces a recoverable compass error rather than silently freezing forever.

### 8. Suspend / resume lifecycle

Run this once while compass is off and once while compass is on:

- [ ] With a valid GPS fix, suspend/leave the Web App long enough for the previous fix to become stale, then resume it.
- [ ] The map/navigation does not jump back to an old delayed geolocation callback after resume.
- [ ] Compass watchdogs do not treat suspended time as active sensor-silence time.
- [ ] The first valid post-resume compass sample becomes the new heading seed rather than blending across the hidden interval.
- [ ] Page resume does not produce duplicate navigation actions, duplicate Places requests, or multiple visible error overlays.
- [ ] If continuous GPS updates fail to resume on this host, record whether pressing `◎` restores them without reloading the app.

### 9. Signal overlay

- [ ] Enable route traffic-signal display on a route known to contain signals.
- [ ] Markers correspond to the active route corridor and do not reappear from an older route after replacement/cancel.
- [ ] Toggling signals from the menu returns to the current follow position when follow mode is active.

### 10. End navigation and recovery

- [ ] End navigation from the D-pad menu.
- [ ] Route, signal markers, transient Directions errors, turn-zoom state, and arrival state are cleared appropriately.
- [ ] The map remains usable without reload: `◎`, search, destination picker, and compass can each be used again.

## Result record

Copy this compact block into an issue or PR when a real-device run is performed:

```text
Commit:
Ray-Ban / firmware:
Meta AI app version:
Phone OS / model:
Test mode: walking / driving / stationary
Search input: native voice / native handwriting / fallback keyboard
Selected travel mode: walking / driving / bicycling / transit
Result: PASS / FAIL
Failed checklist item(s):
Observed behavior:
Reproduction notes:
```

Do not include API keys, precise home/work addresses, account identifiers, or other personal information in the result record.
