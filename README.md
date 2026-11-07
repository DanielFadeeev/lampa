# Lampa — Apple TV-inspired theme

Install/update URL: https://danielfadeeev.github.io/lampa/apple.js

Version 1.2.6. A self-contained presentation plugin with no runtime dependencies, external fonts, storage writes or playback/network setting overrides.

Includes a narrowly checked compatibility repair for the No Shots plugin's recursive PlayerPanel.render timer wrapper. The native panel getter and normal player lifecycle are preserved; no application restart is needed to stop the queued recursive callbacks.

Sources: `src/theme.css` and `src/runtime.js`. Build: `node scripts/build.cjs`. Commit the generated `apple.js` together with the sources.

The theme keeps native Lampa controls and posters, adds a cinematic hero, refines the detail screen and provides a high-contrast TV focus. Work is paused while hidden; catalogue-wide observation is removed after initialization; rapid navigation coalesces artwork requests. `window.__apple_tv_plus_ui.destroy()` releases observers, timers, handlers and injected styles.

Restart Lampa after updating from the legacy 1.0 build, which has no teardown interface. This theme does not guarantee a device-wide frame rate or change torrent download speeds.
