# Apple TV+ UI — 1.1.0, 2026-11-07

Production build: `apple.js`. Original live build: `apple.original.js` (1.0.0).

## Performance findings in 1.0.0

These are source-level amplification risks, not a claim that this plugin alone caused all device slowness. No on-device frame-time profile was available to this subtask.

| Area | Before | After |
|---|---|---|
| Backdrop compositing | Header, menu, settings and modal surfaces used 30px `backdrop-filter` blur | Opaque/tinted gradient surfaces; backdrop filters explicitly disabled |
| Card focus | Animated `box-shadow` on every focused card; 5.5% scale | No card shadows or shadow transitions; 3.5% transform, opacity-only focus ring |
| Observation | One `document.body` observer watched subtree insertions **and all descendant class changes** | Direct activity mount insertions, class-only observation of activity roots, and child insertion observation inside the current home activity |
| Focus signals | Native events, delegated jQuery events and the class observer could re-arm the same focus timer | Native/jQuery compatibility retained, duplicate card events collapse; class changes are not used to poll card focus |
| Hero images | New focused card could request a `w1280` backdrop after 90ms | Text after 65ms; artwork only after another 240ms of deliberate dwell; `w780` hero artwork |
| Hero replacement | Existing artwork was hidden while its replacement downloaded | Two image slots retain the previous loaded artwork and fade in a successful replacement |
| DOM updates | Repeated hero selector lookups and unconditional text writes | Cached hero references; unchanged text is not rewritten |
| Cleanup | No public cleanup for observers, subscriptions, timers and injected layout classes | `window.__apple_tv_plus_ui.destroy()` restores layout/style, disconnects observers, releases timers/events and clears the Lampa dispatcher callback |

No synchronous network requests, `scroll` handlers or `resize` handlers were present in the original plugin. Those were not invented as findings. The new plugin also adds none. Hero artwork still uses the user's existing Lampa image/proxy API; no global API function or image setting is overridden.

## Visual and TV navigation work

- Restrained dark palette, solid/tinted navigation surfaces and a softer static hero vignette.
- Consistent card corners, a stable high-contrast focus ring and brief transform/opacity transitions.
- Full detail screen styling uses real current Lampa selectors: `full-start-new__title`, `__head`, `__rate-line`, `__details`, `__buttons` and the existing native background.
- Clearer two-line title hierarchy; secondary tagline and metadata; compact rating/source/age/status badges.
- Detail action buttons wrap with consistent spacing; poster/image corners and borders are consistent.
- Existing native quality badges are styled if present. No 4K/HDR/Dolby Vision badges are fabricated from a film title or poster: actual playback capabilities remain the responsibility of the source/stream.
- Existing navigation selectors, click handlers, controller collections and native lazy loading are retained. The hero is `aria-hidden`, non-focusable and presentation-only.
- Reduced-motion preference and Lampa's `no--animation` class suppress animation; `will-change` is limited to the currently focused/hovered controls and is released when the state class leaves.

## Verification completed

Commands:

```powershell
node --check .\apple.js
node .\test-sanity.cjs
```

Behavioral checks use jsdom 26.1.0 in `test-runtime/`:

1. A normal mount creates one hero and requests one settled image using `w780`.
2. 100 unrelated card-class mutations cause zero extra activity refreshes.
3. A rapid 15-card focus burst, including duplicate native focus signals, produces one artwork request for the final focused card.
4. Returning to the previous card while another focus is pending leaves the latest card selected.
5. Duplicate script injection creates no duplicate CSS, hero or Lampa subscriptions.
6. Main → full navigation removes the custom home layout and applies scoped detail styling.
7. Destroy removes CSS/layout classes and releases the dispatcher; old notifications cannot recreate the UI.
8. Re-enable creates one CSS block while reusing one Lampa dispatcher.
9. Static contract checks reject shadow animation, blur activation, script-owned API requests and Storage writes.

These checks do not establish 60fps or network throughput. Final device QA must inspect the 1920×1080 interface, a long title, focus navigation, detail action buttons and main → full → back navigation.

## Deployment and rollback

- Replace the hosted file `apple.js` with this build at the already-installed plugin URL.
- Restart Lampa after deployment so the legacy 1.0.0 JavaScript and its anonymous handlers leave the WebView. Clearing only the Lampa cache is safe; do not clear application data/localStorage.
- This build deliberately refuses an unsafe same-window replacement of 1.0.0 because the old build has no teardown interface. It logs a restart request instead of running two competing versions.
- Subsequent 1.1.0 injections are idempotent. Future versions with the same lifecycle can replace an older version by calling its `destroy()`.
- Rollback: restore `apple.original.js` as the hosted `apple.js` and restart Lampa, or disable the plugin and restart.

## Primary DOM references

Fetched read-only from the Lampa author's repository, `main`, during this audit:

- https://raw.githubusercontent.com/yumata/lampa-source/main/src/components/full/start.js
- https://raw.githubusercontent.com/yumata/lampa-source/main/src/templates/full/start_new.js
- https://raw.githubusercontent.com/yumata/lampa-source/main/src/components/full.js

Copies are under `reference/`. This subtask did not access ADB, change device settings or push to Git.

## 1.2.0 — 2026-11-07

Cinematic Apple TV-inspired visual pass with native typography, full-card action hierarchy, restrained focus and compact TV layouts. Source CSS and runtime are separated; the production file remains a single dependency-free script.

Runtime now stops broad initialization observation once cards arrive, handles late metadata without redundant image requests, rejects stale image callbacks, recovers from failed artwork on user navigation, pauses in the background, and releases all owned resources on teardown. Browser checks passed at 1920×1080, 1280×720 and 960×540; idle fixtures made zero additional refreshes/image requests. These are code and fixture checks, not a measured 60fps claim for the television.

## 1.2.1 — TV cinema layout and safe area

Full details now use the native backdrop as an edge-to-edge cinema screen with large left-aligned title and white play pill. Catalogue posters remain native. Main hero and poster sizes account for the TV header and reserve room for titles/year at 1080p,720p and540p. Removed native permanent will-change layers from all catalogue cards; only focused controls opt in. Navigation/controller/data remain unchanged.

## 1.2.2 — Continuous cinema backdrop

The static vignette now follows the full native backdrop instead of ending at the shorter detail panel, removing the horizontal seam below the actions. No layout measuring, extra network calls or animated masks were introduced.

## 1.2.5 — Progressive artwork and stable ratings

The hero immediately reuses the selected card's decoded poster in one bounded 640x360 canvas while its matching backdrop loads. This makes no additional image request and retains the matching poster if the backdrop fails. Obsolete requests cannot reveal another title's artwork. Native IMDb/KP placeholders retain invisible slots until real ratings arrive; badge dimensions and action positions remain stable. Removed duplicate native background/rating opacity animations.

## 1.2.4 — Stable motion and activity lifecycle

Removed overlapping native/theme focus scales and entry keyframes. Detail action labels keep their width when focus moves. Cached home geometry survives detail navigation, and native start/archive events synchronize before paint. Focus updates coalesce per animation frame, obsolete artwork is hidden under a new title, and removed card handlers are released. Added motion and lifecycle regression checks.

## 1.2.3 — Cinematic home and compact navigation

Recomposed the home screen around a larger, bottom-aligned cinematic hero and a compact poster rail. Reduced the native header, icons and title so navigation occupies less of the television. Kept the native posters, controllers and detail actions.

Added direct native/jQuery/`$` focus compatibility and a coalesced, one-shot DPAD fallback for custom controllers. A recreated hero always repopulates its text. All owned card handlers are released when leaving the home screen or destroying the plugin; no polling or catalogue-wide class observer was added.
