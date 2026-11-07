/*
 * Compatibility repair for and7ey/lampa/noshots.js.
 * Its PlayerPanel.render wrapper schedules removeShotsPlayerButton(), which
 * calls render again and creates a multiplying 10 ms timer chain. The native
 * Lampa render contract is a pure getter for the initialized player-panel DOM.
 * Repair only that exact known wrapper; leave every other plugin untouched.
 */
(function () {
    'use strict';
    if (window.__atvp_noshots_compat) {
        window.__atvp_noshots_compat.check();
        return;
    }
    var state = { version: 1, repairs: 0, panel: null, rawRender: null, lastChecked: null, bound: false };
    window.__atvp_noshots_compat = state;

    function validPanel(panel) {
        return panel && typeof panel.find === 'function' && panel[0] &&
            panel[0].nodeType === 1 && panel[0].classList && panel[0].classList.contains('player-panel');
    }
    function getter() { return state.panel; }
    function check() {
        var lampa = window.Lampa;
        var api = lampa && lampa.PlayerPanel;
        if (!api || typeof api.render !== 'function' || api.render === getter) return;
        var wrapped = api.render;
        if (wrapped === state.lastChecked) return;
        state.lastChecked = wrapped;
        var source = Function.prototype.toString.call(wrapped);
        if (!/\boriginalRender\s*\.\s*call\s*\(\s*this\s*\)/.test(source) ||
            !/\bsetTimeout\s*\(\s*removeShotsPlayerButton\s*,\s*10\s*\)/.test(source) ||
            !/\breturn\s+result\b/.test(source)) return;
        // Calling the recognized getter once adds at most one final cleanup
        // callback. Existing callbacks stop rescheduling on their next turn.
        var raw = state.rawRender || wrapped;
        var panel;
        try { panel = raw.call(api); } catch (ignore) { return; }
        if (!validPanel(panel)) return;
        state.panel = panel;
        state.rawRender = raw;
        api.render = getter;
        if (!state.initPatched && typeof api.init === 'function') {
            var initialize = api.init;
            api.init = function () {
                var result = initialize.apply(this, arguments);
                // Normal playback keeps the native panel. An explicit native
                // reinitialization may replace it, so refresh the captured DOM.
                var updated = state.rawRender.call(api);
                if (validPanel(updated)) state.panel = updated;
                return result;
            };
            state.initPatched = true;
        }
        state.repairs++;
        if (window.console && console.info) console.info('AppleTVPlusUI: repaired No Shots recursive render timer');
    }
    function bind() {
        var lampa = window.Lampa;
        if (!lampa || !lampa.Listener || !lampa.Listener.follow || state.bound) return;
        state.bound = true;
        // Load ordering can differ. Event-driven rechecks only inspect a new
        // render function identity; there is no polling, observer or new timer.
        lampa.Listener.follow('app,activity,player', check);
    }
    state.check = function () { bind(); check(); };
    state.check();
})();

/*
 * Apple TV+ presentation for Lampa 1.2.6 — Android TV / low-paint edition.
 * Local presentation only: no Storage writes, accounts, API overrides, telemetry,
 * controller replacement, fabricated media capabilities or external dependencies.
 * DOM references: yumata/lampa-source components/full/start.js,
 * templates/full/start_new.js and components/full.js (audited 2026-11-07).
 * Rollback: disable this plugin and restart Lampa, or call its destroy() method.
 */
(function () {
    'use strict';

    var VERSION = '1.2.6';
    var STYLE_ID = 'apple-tv-plus-ui-style';
    var previous = window.__apple_tv_plus_ui;
    if (previous && !previous.destroyed) {
        if (previous.version === VERSION) return;
        if (typeof previous.destroy === 'function') previous.destroy();
        else {
            // 1.0.0 did not expose its event handlers. A reload is the only safe
            // upgrade: do not leave two competing observers/heroes running.
            console.warn('AppleTVPlusUI: restart Lampa to apply version ' + VERSION);
            return;
        }
    }

    var state = {
        version: VERSION, destroyed: false, started: false,
        root: null, fullRoot: null, hero: null, scroll: null, refs: null, homeActive: false,
        currentCard: null, pendingCard: null, observedCard: null, heroSignature: '',
        imageURL: '', loadedImageURL: '', imageSlot: 0, requestedImage: null, posterCard: null, posterURL: '',
        imageRequestID: 0, failedImageURL: '', imageRetryAfter: 0,
        refreshTimer: 0, focusTimer: 0, imageTimer: 0, bootstrapTimer: 0, keyTimer: 0,
        frame: 0, bootstrapAttempts: 0, mount: null,
        mountObserver: null, activityObserver: null, homeObserver: null, cardObserver: null,
        homeObserverRoot: null, homeObserverMode: '',
        homeBootstrapTimer: 0, jqueryBound: false, jquery: null, boundCards: [], boundCardSet: new WeakSet(),
        stats: { refreshes: 0, heroUpdates: 0, imageRequests: 0, posterCopies: 0 }
    };
    window.__apple_tv_plus_ui = state;

    var css = "/*\n * Apple TV-inspired presentation. Native Lampa structure, data and focus order\n * remain authoritative. Focus geometry stays fixed; only opacity fades remain.\n */\n\n/* Shared palette: private variables cannot leak into native Lampa components. */\nbody.atvp-ui {\n    --atvp-bg: #07080b;\n    --atvp-surface: #14161c;\n    --atvp-primary: #f5f5f7;\n    --atvp-secondary: #b5b7c1;\n    --atvp-muted: #90939e;\n    --atvp-line: #ffffff1c;\n    background: var(--atvp-bg) !important;\n    color: var(--atvp-primary) !important;\n}\n\nbody.atvp-ui .background { opacity: .18 !important; filter: none !important; -webkit-filter: none !important; }\n\n/* A stable dark navigation surface is less expensive than live background blur. */\nbody.atvp-ui .head {\n    height: 2.75em !important;\n    background: linear-gradient(180deg,#07080bf5,#07080bc4) !important;\n    border-bottom: 0;\n    backdrop-filter: none !important;\n    -webkit-backdrop-filter: none !important;\n}\nbody.atvp-ui .head__body {\n    box-sizing: border-box;\n    height: 2.75em !important;\n    min-height: 0;\n    padding: .35em 1.65em !important;\n    background: transparent !important;\n}\nbody.atvp-ui .wrap__content { padding-top: 2.75em !important; }\nbody.atvp-ui .head__actions { align-items: center; }\nbody.atvp-ui .head__logo-icon {\n    width: 1.85em;\n    height: 1.85em;\n    position: relative;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    border-radius: .4em;\n    background: transparent;\n}\nbody.atvp-ui .head__logo-icon > img { opacity: 0 !important; }\nbody.atvp-ui .head__logo-icon:after {\n    content: \"TV+\";\n    position: absolute;\n    font-size: .95em;\n    font-weight: 700;\n    letter-spacing: -.06em;\n    color: var(--atvp-primary);\n    pointer-events: none;\n}\nbody.atvp-ui .head__title { font-size: .88em; font-weight: 500; letter-spacing: -.025em; opacity: .6; }\nbody.atvp-ui .head__time-now { font-size: 1.55em !important; font-weight: 400; letter-spacing: -.045em; }\nbody.atvp-ui .head__time-date,\nbody.atvp-ui .head__time-week { font-size: .82em; color: var(--atvp-muted); }\nbody.atvp-ui .head__time-now,\nbody.atvp-ui .head__time-date,\nbody.atvp-ui .head__time-week { display: none !important; }\nbody.atvp-ui .head__action {\n    box-sizing: border-box;\n    width: 2em !important;\n    height: 2em !important;\n    padding: .35em !important;\n    margin-left: .85em !important;\n    border-radius: 50% !important;\n    transition: opacity .12s ease !important;\n}\nbody.atvp-ui .head__action > svg,\nbody.atvp-ui .head__action > img { width: 1.3em !important; height: 1.3em !important; }\nbody.atvp-ui .head__action.open--profile { padding: .18em !important; }\nbody.atvp-ui .head__action.open--profile > img,\nbody.atvp-ui .head__action.open--profile > svg { width: 1.64em !important; height: 1.64em !important; }\nbody.atvp-ui .head__markers { margin: 0 .4em 0 1em; font-size: .8em; }\nbody.atvp-ui .head__action.focus {\n    color: #101115 !important;\n    background: var(--atvp-primary) !important;\n}\n\nbody.atvp-ui .menu,\nbody.atvp-ui .settings__content,\nbody.atvp-ui .selectbox__content,\nbody.atvp-ui .modal__content,\nbody.atvp-ui .context-menu {\n    color: var(--atvp-primary);\n    background: #14171efa !important;\n    border: 1px solid var(--atvp-line);\n    box-shadow: none !important;\n    backdrop-filter: none !important;\n    -webkit-backdrop-filter: none !important;\n}\nbody.atvp-ui .settings__content,\nbody.atvp-ui .selectbox__content,\nbody.atvp-ui .modal__content { border-radius: .9em !important; }\nbody.atvp-ui .menu__item,\nbody.atvp-ui .settings-param,\nbody.atvp-ui .selectbox-item { border-radius: .55em !important; }\nbody.atvp-ui .menu__item.focus,\nbody.atvp-ui .settings-param.focus,\nbody.atvp-ui .selectbox-item.focus {\n    color: #111318 !important;\n    background: var(--atvp-primary) !important;\n}\nbody.atvp-ui .settings-param.focus .settings-param__name,\nbody.atvp-ui .settings-param.focus .settings-param__value,\nbody.atvp-ui .settings-param.focus .settings-param__descr { color: inherit !important; }\n\n/* Native advanced-animation keyframes otherwise bounce the inner poster while\n   the theme scales its parent. Keep both levels stationary so Lampa's rail\n   scroller sees exactly the same geometry before and after a focus change. */\nbody.atvp-ui .card,\nbody.atvp-ui .card__view,\nbody.atvp-ui .head__action,\nbody.atvp-ui .menu__item,\nbody.atvp-ui .full-start__button,\nbody.atvp-ui .simple-button {\n    animation: none !important;\n    -webkit-animation: none !important;\n    transform: none !important;\n    -webkit-transform: none !important;\n    will-change: auto !important;\n}\n/* Native advanced-animation also translates the entire activity body on entry.\n   A fixed hero outside that body must not separate from its moving catalogue. */\nbody.atvp-ui .atvp-home > .activity__body,\nbody.atvp-ui .atvp-full > .activity__body {\n    animation: none !important;\n    -webkit-animation: none !important;\n    transform: none !important;\n    -webkit-transform: none !important;\n    transition: none !important;\n}\n\n/* The focus ring fades without resizing a card or repainting a moving shadow. */\nbody.atvp-ui .card {\n    transition: none !important;\n}\nbody.atvp-ui .card__img,\nbody.atvp-ui .card__view,\nbody.atvp-ui .card__filter { border-radius: .6em !important; }\nbody.atvp-ui .card__view { background: #17191f; box-shadow: none !important; transition: none !important; }\nbody.atvp-ui .card.focus,\nbody.atvp-ui .card.hover { z-index: 2; }\nbody.atvp-ui .card .card__view:after {\n    content: \"\";\n    position: absolute;\n    top: -3px !important;\n    left: -3px !important;\n    right: -3px !important;\n    bottom: -3px !important;\n    border: 2px solid #fff !important;\n    border-radius: calc(.6em + 3px) !important;\n    box-shadow: none !important;\n    pointer-events: none;\n    z-index: 3 !important;\n    opacity: 0;\n    transition: opacity .12s ease !important;\n}\nbody.atvp-ui .card.focus .card__view:after,\nbody.atvp-ui .card.hover .card__view:after { opacity: 1; }\nbody.atvp-ui .card__title {\n    color: #e8e9ed;\n    font-size: 1.02em !important;\n    font-weight: 500;\n    letter-spacing: -.015em;\n    line-height: 1.3;\n    -webkit-line-clamp: 2 !important;\n}\nbody.atvp-ui .card.focus .card__title,\nbody.atvp-ui .card.hover .card__title { color: #fff; }\nbody.atvp-ui .card__age { font-size: .82em; color: var(--atvp-muted); }\nbody.atvp-ui .card__vote,\nbody.atvp-ui .card__quality > div,\nbody.atvp-ui .card__type {\n    color: var(--atvp-primary) !important;\n    background: #101217e8 !important;\n    border: 1px solid #ffffff18;\n    border-radius: .3em !important;\n}\nbody.atvp-ui .items-line__title,\nbody.atvp-ui .category-full__title { font-weight: 600 !important; letter-spacing: -.025em; }\n\n/* Reuse native action elements so remote control and third-party actions survive. */\nbody.atvp-ui .full-start__button,\nbody.atvp-ui .simple-button {\n    border-radius: .65em !important;\n    transition: opacity .12s ease !important;\n    box-shadow: none !important;\n}\nbody.atvp-ui .full-start__button.focus,\nbody.atvp-ui .simple-button.focus {\n    color: #111318 !important;\n    background: var(--atvp-primary) !important;\n}\nbody.atvp-ui .full-start__poster,\nbody.atvp-ui .full-start__img,\nbody.atvp-ui .full-start-new__poster,\nbody.atvp-ui .full-start-new__img { border-radius: .7em !important; }\n\n/* Native detail screen: real poster, real source metadata and a quiet vignette. */\nbody.atvp-ui .atvp-full .full-start-new {\n    position: relative;\n    background: linear-gradient(90deg,#07080bd9 0%,#07080ba3 49%,#07080b28 100%);\n    border-radius: .85em;\n}\nbody.atvp-ui .atvp-full .full-start-new__body { align-items: center; gap: 2.5em; }\nbody.atvp-ui .atvp-full .full-start-new__right { min-width: 0; }\nbody.atvp-ui .atvp-full .full-start-new__poster { border: 1px solid #ffffff1c; box-shadow: none !important; }\nbody.atvp-ui .atvp-full .full-start-new__head {\n    color: #c0c4ce;\n    font-size: .88em;\n    font-weight: 500;\n    letter-spacing: .025em;\n    margin-bottom: .7em;\n}\nbody.atvp-ui .atvp-full .full-start-new__title {\n    font-size: 3.05em !important;\n    font-weight: 700;\n    line-height: 1.08 !important;\n    letter-spacing: -.04em;\n    white-space: normal !important;\n    overflow: hidden;\n    display: -webkit-box;\n    -webkit-line-clamp: 2;\n    -webkit-box-orient: vertical;\n    max-height: 2.2em;\n    overflow-wrap: break-word;\n}\nbody.atvp-ui .atvp-full .full-start-new__tagline {\n    color: #d2d4dc;\n    font-size: 1.03em !important;\n    line-height: 1.4;\n    margin-top: .7em;\n    max-height: 2.8em;\n    overflow: hidden;\n}\nbody.atvp-ui .atvp-full .full-start-new__rate-line {\n    display: flex;\n    align-items: center;\n    flex-wrap: wrap;\n    gap: .45em;\n    margin: 1.05em 0 .8em;\n}\n/* IMDb/KP are native asynchronous slots: reserve their geometry while hidden\n   instead of moving the other badges and actions when metadata arrives. The\n   slots remain invisible and empty until Lampa supplies a real rating. */\nbody.atvp-ui .atvp-full .full-start-new__rate-line > .rate--imdb.hide,\nbody.atvp-ui .atvp-full .full-start-new__rate-line > .rate--kp.hide {\n    display: flex !important;\n    visibility: hidden !important;\n}\nbody.atvp-ui .atvp-full .full-start-new__rate-line,\nbody.atvp-ui .atvp-full .full-start-new__rate-line .full-start__rate,\nbody.atvp-ui .atvp-full .full-start-new__rate-line .full-start__rate > * {\n    animation: none !important;\n    -webkit-animation: none !important;\n    transition: none !important;\n    opacity: 1 !important;\n}\nbody.atvp-ui .atvp-full .full-start-new__rate-line .full-start__rate {\n    box-sizing: border-box;\n    flex: 0 0 5.8em;\n    width: 5.8em;\n    height: 2.35em;\n    font-variant-numeric: tabular-nums;\n}\nbody.atvp-ui .atvp-full .full-start__rate,\nbody.atvp-ui .atvp-full .full-start__pg,\nbody.atvp-ui .atvp-full .full-start__status {\n    margin: 0 !important;\n    border: 1px solid #ffffff26;\n    border-radius: .3em;\n    background: #12151bd9;\n    line-height: 1.2;\n    padding: .3em .5em;\n}\nbody.atvp-ui .atvp-full .full-start__rate > div:first-child { font-weight: 600; }\nbody.atvp-ui .atvp-full .full-start__rate > div + div {\n    color: #b9becb;\n    font-size: .68em;\n    letter-spacing: .045em;\n}\nbody.atvp-ui .atvp-full .full-start__pg,\nbody.atvp-ui .atvp-full .full-start__status { font-size: .8em; letter-spacing: .025em; }\nbody.atvp-ui .atvp-full .tag--quality > div,\nbody.atvp-ui .atvp-full .full-start__quality {\n    border: 1px solid #ffffff40;\n    border-radius: .3em;\n    padding: .2em .4em;\n    font-weight: 600;\n    letter-spacing: .04em;\n}\nbody.atvp-ui .atvp-full .full-start-new__details {\n    color: #c0c4ce;\n    font-size: .88em;\n    line-height: 1.65;\n    margin: .75em 0;\n}\nbody.atvp-ui .atvp-full .full-start-new__split { opacity: .4; padding: 0 .5em; }\nbody.atvp-ui .atvp-full .full-start-new__reactions { font-size: .82em; opacity: .85; }\nbody.atvp-ui .atvp-full .full-start-new__buttons {\n    display: flex;\n    align-items: center;\n    flex-wrap: wrap;\n    gap: .65em;\n    margin-top: 1.2em;\n}\nbody.atvp-ui .atvp-full .full-start-new__buttons > .full-start__button {\n    flex: 0 0 auto;\n    margin: 0 !important;\n    min-height: 2.85em;\n    max-width: 100%;\n    background: #ffffff12;\n    border: 1px solid #ffffff1c;\n}\n/* Native Lampa hides every nonfocused action label with display:none. That\n   shrinks Play and expands the next button, pushing all remaining actions on\n   each key press. Reserve every label at all times; native handlers and focus\n   order survive, and text-only third-party actions remain readable. */\nbody.atvp-ui .atvp-full .full-start-new__buttons > .full-start__button > span {\n    display: inline-block !important;\n    max-width: 14em;\n    white-space: nowrap;\n    overflow: hidden;\n    text-overflow: ellipsis;\n}\nbody.atvp-ui .atvp-full .full-start-new__buttons > .button--play {\n    color: #111318 !important;\n    background: var(--atvp-primary) !important;\n    border-color: transparent;\n    font-weight: 600;\n    padding-left: 1.1em;\n    padding-right: 1.25em;\n}\nbody.atvp-ui .atvp-full .full-start-new__buttons > .button--play.focus {\n    outline: 2px solid #fff;\n    outline-offset: 4px;\n}\nbody.atvp-ui .atvp-full .full-start__background {\n    filter: none !important;\n    -webkit-filter: none !important;\n    opacity: 0;\n    animation: none !important;\n    -webkit-animation: none !important;\n    transition: opacity .24s ease !important;\n}\nbody.atvp-ui .atvp-full .full-start__background.loaded { opacity: .68; }\nbody.atvp-ui .atvp-full .full-start__background.dim { opacity: .13; }\n\n/* Main hero occupies a fixed band. Native rows keep their own scroll geometry. */\nbody.atvp-ui .atvp-home { --atvp-hero-height: 43vh; }\nbody.atvp-ui .atvp-home > .activity__body { height: 100% !important; }\nbody.atvp-ui .atvp-main-scroll {\n    position: absolute !important;\n    top: var(--atvp-hero-height) !important;\n    left: 0;\n    right: 0;\n    bottom: 0;\n    height: calc(100% - var(--atvp-hero-height)) !important;\n}\nbody.atvp-ui .atvp-main-scroll > .scroll__content { padding-top: .85em !important; }\nbody.atvp-ui .atvp-home .items-line { padding-bottom: 1.5em; }\nbody.atvp-ui .atvp-home .items-line__title { font-size: 1.25em; line-height: 1.25; }\nbody.atvp-ui .atvp-home .card__title { font-size: .94em !important; }\nbody.atvp-ui .atvp-home .card__age { font-size: .74em; }\nbody.atvp-ui .atvp-hero {\n    position: absolute;\n    left: 0;\n    top: 0;\n    right: 0;\n    height: var(--atvp-hero-height);\n    overflow: hidden;\n    isolation: isolate;\n    pointer-events: none;\n    z-index: 1;\n    background: linear-gradient(110deg,#111722,#07080b 74%);\n}\nbody.atvp-ui .atvp-hero__art {\n    position: absolute;\n    right: 0;\n    top: 0;\n    width: 100%;\n    height: 100%;\n    object-fit: cover;\n    object-position: 65% 36%;\n    opacity: 0;\n    transition: opacity .24s ease;\n}\nbody.atvp-ui .atvp-hero__art.atvp-image-visible { opacity: .98; }\nbody.atvp-ui .atvp-hero:after {\n    content: \"\";\n    position: absolute;\n    top: 0;\n    left: 0;\n    right: 0;\n    bottom: 0;\n    background: linear-gradient(90deg,#07080bf5 0%,#07080bb8 30%,#07080b12 75%),linear-gradient(0deg,#07080b 0%,#07080b28 28%,#07080b00 65%);\n    z-index: 1;\n}\nbody.atvp-ui .atvp-hero__content {\n    position: absolute;\n    left: 2.25em;\n    right: 34%;\n    bottom: 2.25em;\n    z-index: 2;\n}\nbody.atvp-ui .atvp-hero__eyebrow {\n    display: none;\n    color: #b3bac7;\n    text-transform: uppercase;\n    font-size: .6em;\n    font-weight: 600;\n    letter-spacing: .18em;\n    margin-bottom: .85em;\n}\nbody.atvp-ui .atvp-hero__title {\n    color: var(--atvp-primary);\n    font-size: 3.9em;\n    font-weight: 700;\n    line-height: 1.08;\n    letter-spacing: -.04em;\n    max-height: 2.2em;\n    overflow: hidden;\n    overflow-wrap: break-word;\n    display: -webkit-box;\n    -webkit-line-clamp: 2;\n    -webkit-box-orient: vertical;\n}\nbody.atvp-ui .atvp-hero__meta { color: #d0d2d9; font-size: .75em; line-height: 1.45; margin-top: .9em; }\nbody.atvp-ui .atvp-hero__overview {\n    color: #d5d8e1;\n    font-size: .84em;\n    line-height: 1.45;\n    margin-top: .8em;\n    max-width: 35em;\n    overflow: hidden;\n    display: -webkit-box;\n    -webkit-line-clamp: 2;\n    -webkit-box-orient: vertical;\n}\nbody.atvp-ui .atvp-hero__meta[hidden],\nbody.atvp-ui .atvp-hero__overview[hidden] { display: none !important; }\n\n/* Keep two-line titles and actions inside the safe region on smaller TV output. */\n/* Native poster dimensions also need a height budget below the fixed TV header.\n   Pure CSS keeps rows stable without a resize handler or synchronous measuring. */\nbody.atvp-ui .atvp-home .items-line .card:not(.card--wide):not(.card--collection):not(.card--folder) {\n    width: min(11em, 18.5vh) !important;\n    flex-basis: min(11em, 18.5vh) !important;\n}\n@media (max-height: 720px) {\n    body.atvp-ui .atvp-home { --atvp-hero-height: 43vh; }\n    body.atvp-ui .atvp-hero__title { font-size: 3.45em; }\n    body.atvp-ui .atvp-hero__overview { font-size: .8em; -webkit-line-clamp: 1; }\n    body.atvp-ui .atvp-full .full-start-new__title { font-size: 2.75em !important; }\n    body.atvp-ui .atvp-full .full-start-new__body { gap: 2em; }\n    body.atvp-ui .atvp-full .full-start-new__buttons { margin-top: .9em; }\n}\n@media (max-height: 600px) {\n    body.atvp-ui .atvp-hero__content { left: 2em; right: 36%; }\n    body.atvp-ui .atvp-hero__title { font-size: 3.25em; }\n    body.atvp-ui .atvp-hero__eyebrow { margin-bottom: .65em; }\n    body.atvp-ui .atvp-full .full-start-new__title { font-size: 2.5em !important; }\n}\n\n/* Landscape TV detail view is a cinematic stage rather than a poster/text split.\n   Only the decorative detail-poster column is hidden; catalogue posters, data,\n   action elements and their Controller order are unchanged. */\n@media (min-width: 790px) {\n    body.atvp-ui .atvp-full .full-start__background {\n        position: absolute;\n        top: 0;\n        left: 0;\n        right: 0;\n        width: 100%;\n        height: 92vh;\n        object-fit: cover;\n        object-position: 50% 25%;\n        /* The vignette belongs to the image, not the shorter detail block.\n           Static masks share the backdrop's dimensions and cannot leave a seam\n           when native sections below the action row change height. */\n        -webkit-mask-image: linear-gradient(90deg,transparent 0%,#0003 25%,#000 80%),linear-gradient(180deg,#000 0%,#000 48%,transparent 100%);\n        -webkit-mask-composite: source-in;\n        mask-image: linear-gradient(90deg,transparent 0%,#0003 25%,#000 80%),linear-gradient(180deg,#000 0%,#000 48%,transparent 100%);\n        mask-composite: intersect;\n    }\n    body.atvp-ui .atvp-full .full-start__background.loaded { opacity: .94; }\n    body.atvp-ui .atvp-full .full-start__background.dim { opacity: .15; }\n    body.atvp-ui .atvp-full .full-start-new {\n        z-index: 1;\n        border-radius: 0;\n        background: transparent;\n    }\n    body.atvp-ui .atvp-full .full-start-new__body {\n        box-sizing: border-box;\n        min-height: 60vh;\n        padding: 2.6em 2.5em 2.8em;\n        align-items: center;\n        gap: 0;\n    }\n    body.atvp-ui .atvp-full .full-start-new__left { display: none; }\n    body.atvp-ui .atvp-full .full-start-new__right {\n        box-sizing: border-box;\n        flex: 0 1 62%;\n        width: 62%;\n        max-width: 42em;\n        margin: 0;\n        padding: 0;\n    }\n    body.atvp-ui .atvp-full .full-start-new__title {\n        font-size: 4em !important;\n        line-height: 1.02 !important;\n        letter-spacing: -.045em;\n        max-height: 2.1em;\n    }\n    body.atvp-ui .atvp-full .full-start-new__head { font-size: .8em; margin-bottom: .8em; }\n    body.atvp-ui .atvp-full .full-start-new__tagline { font-size: .98em !important; max-height: 1.4em; margin-top: .8em; }\n    body.atvp-ui .atvp-full .full-start-new__rate-line { font-size: .9em; margin: 1em 0 .75em; }\n    body.atvp-ui .atvp-full .full-start-new__details { font-size: .85em; margin: .75em 0 0; }\n    body.atvp-ui .atvp-full .full-start-new__reactions { display: none; }\n    body.atvp-ui .atvp-full .full-start-new__buttons { margin-top: 1.35em; gap: .65em; }\n    body.atvp-ui .atvp-full .full-start-new__buttons > .full-start__button { border-radius: 999px !important; min-height: 3em; }\n    body.atvp-ui .atvp-full .full-start-new__buttons > .button--play { padding-left: 1.3em; padding-right: 1.5em; }\n}\n@media (min-width: 790px) and (max-height: 720px) {\n    body.atvp-ui .atvp-full .full-start-new__body { min-height: 61vh; padding: 2em 2.3em; }\n    body.atvp-ui .atvp-full .full-start-new__right { flex-basis: 67%; width: 67%; }\n    body.atvp-ui .atvp-full .full-start-new__title { font-size: 3.45em !important; }\n    body.atvp-ui .atvp-full .full-start-new__head { margin-bottom: .6em; }\n    body.atvp-ui .atvp-full .full-start-new__tagline { margin-top: .6em; }\n    body.atvp-ui .atvp-full .full-start-new__rate-line { margin: .8em 0 .6em; }\n    body.atvp-ui .atvp-full .full-start-new__buttons { margin-top: 1em; }\n}\n@media (min-width: 790px) and (max-height: 600px) {\n    body.atvp-ui .atvp-full .full-start-new__body { min-height: 63vh; padding: 1.6em 2em; }\n    body.atvp-ui .atvp-full .full-start-new__right { flex-basis: 72%; width: 72%; }\n    body.atvp-ui .atvp-full .full-start-new__title { font-size: 3em !important; }\n    body.atvp-ui .atvp-full .full-start-new__tagline { display: none; }\n}\n\n/* Native animation preference and OS reduced-motion preference are respected. */\n@media (prefers-reduced-motion: reduce) {\n    body.atvp-ui .card,\n    body.atvp-ui .card__view:after,\n    body.atvp-ui .head__action,\n    body.atvp-ui .full-start__button,\n    body.atvp-ui .simple-button,\n    body.atvp-ui .atvp-hero__art,\n    body.atvp-ui .full-start__background { transition: none !important; }\n    body.atvp-ui .card.focus,\n    body.atvp-ui .card.hover,\n    body.atvp-ui .head__action.focus,\n    body.atvp-ui .full-start__button.focus,\n    body.atvp-ui .simple-button.focus { transform: none !important; will-change: auto !important; }\n}\nbody.atvp-ui.no--animation .card,\nbody.atvp-ui.no--animation .card__view:after,\nbody.atvp-ui.no--animation .head__action,\nbody.atvp-ui.no--animation .full-start__button,\nbody.atvp-ui.no--animation .simple-button,\nbody.atvp-ui.no--animation .atvp-hero__art,\nbody.atvp-ui.no--animation .full-start__background { transition: none !important; }\nbody.atvp-ui.no--animation .card.focus,\nbody.atvp-ui.no--animation .card.hover,\nbody.atvp-ui.no--animation .head__action.focus,\nbody.atvp-ui.no--animation .full-start__button.focus,\nbody.atvp-ui.no--animation .simple-button.focus { transform: none !important; will-change: auto !important; }";

    function element(value) {
        return value && (value.nodeType === 1 ? value : value[0] && value[0].nodeType === 1 ? value[0] : null);
    }
    function closest(node, selector) {
        return node && node.nodeType === 1 && node.closest ? node.closest(selector) : null;
    }
    function make(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
    function jquery() {
        var jq = window.jQuery || window.$;
        return typeof jq === 'function' && jq.fn && jq.fn.on ? jq : null;
    }
    function activeActivity() {
        try {
            var active = window.Lampa && Lampa.Activity && Lampa.Activity.active();
            return active ? { component: active.component, root: element(active.activity && active.activity.render(true)) || document.querySelector('.activity--active') } : null;
        } catch (ignore) { return null; }
    }
    function clearFocus() {
        cancelPaint(state.focusTimer);
        window.clearTimeout(state.imageTimer);
        state.focusTimer = state.imageTimer = 0;
        state.pendingCard = null;
    }
    function paint(callback) {
        return window.requestAnimationFrame ? window.requestAnimationFrame(callback) : window.setTimeout(callback, 16);
    }
    function cancelPaint(id) {
        if (!id) return;
        if (window.requestAnimationFrame && window.cancelAnimationFrame) window.cancelAnimationFrame(id);
        else window.clearTimeout(id);
    }
    function unbindCard(entry) {
        entry.card.removeEventListener('hover:focus', focusEvent);
        entry.card.removeEventListener('hover:hover', focusEvent);
        if (entry.jquery) entry.jquery(entry.card).off('.atvp-card');
        state.boundCardSet.delete(entry.card);
    }
    function pruneCardEvents() {
        state.boundCards = state.boundCards.filter(function (entry) {
            if (state.root && state.root.contains(entry.card)) return true;
            unbindCard(entry);
            return false;
        });
    }
    function clearCardEvents() {
        state.boundCards.forEach(unbindCard);
        state.boundCards = [];
        state.boundCardSet = new WeakSet();
        cancelPaint(state.keyTimer);
        state.keyTimer = 0;
    }
    function bindCardEvents(card) {
        if (!card || state.boundCardSet.has(card)) return;
        var jq = jquery();
        card.addEventListener('hover:focus', focusEvent);
        card.addEventListener('hover:hover', focusEvent);
        // Some APKs/plugins dispatch jQuery-only, non-bubbling hover events.
        // Bind to each real card; document delegation cannot receive those.
        if (jq) jq(card).on('hover:focus.atvp-card hover:hover.atvp-card', focusEvent);
        state.boundCards.push({ card: card, jquery: jq });
        state.boundCardSet.add(card);
    }
    function cancelRefresh() {
        window.clearTimeout(state.refreshTimer);
        window.clearTimeout(state.bootstrapTimer);
        cancelPaint(state.frame);
        state.refreshTimer = state.bootstrapTimer = state.frame = 0;
    }
    function cancelImage() {
        state.imageRequestID++;
        if (state.requestedImage) {
            state.requestedImage.onload = state.requestedImage.onerror = null;
            state.requestedImage.removeAttribute('src');
        }
        state.requestedImage = null;
    }
    function disconnectCard() {
        if (state.cardObserver) state.cardObserver.disconnect();
        if (state.observedCard) state.observedCard.removeEventListener('load', focusedCardChange, true);
        state.observedCard = null;
    }
    function focusedCardChange() {
        if (!state.destroyed && state.homeActive && !document.hidden && state.observedCard) queueFocus(state.observedCard, true);
    }
    function observeCard(card) {
        if (state.observedCard === card) return;
        disconnectCard();
        if (!card) return;
        state.observedCard = card;
        // Only the selected card can change the hero. Do not inspect every
        // lazy poster/rating mutation in the catalogue while scrolling.
        if (window.MutationObserver) {
            if (!state.cardObserver) state.cardObserver = new MutationObserver(focusedCardChange);
            state.cardObserver.observe(card, { childList: true, subtree: true, characterData: true });
        }
        card.addEventListener('load', focusedCardChange, true);
    }
    function detachHome() {
        clearFocus();
        clearCardEvents();
        cancelImage();
        disconnectCard();
        window.clearTimeout(state.homeBootstrapTimer);
        state.homeBootstrapTimer = 0;
        if (state.homeObserver) state.homeObserver.disconnect();
        state.homeObserverRoot = null;
        state.homeObserverMode = '';
        if (state.root) state.root.classList.remove('atvp-home');
        if (state.scroll) state.scroll.classList.remove('atvp-main-scroll');
        if (state.refs) state.refs.images.forEach(function (image) {
            image.onload = image.onerror = null;
            image.removeAttribute('src');
        });
        if (state.refs && state.refs.poster) state.refs.poster.width = state.refs.poster.height = 0;
        if (state.hero && state.hero.parentNode) state.hero.parentNode.removeChild(state.hero);
        state.root = state.scroll = state.hero = state.refs = state.currentCard = null;
        state.homeActive = false;
        state.imageURL = state.loadedImageURL = state.heroSignature = '';
        state.failedImageURL = '';
        state.imageRetryAfter = 0;
        state.posterCard = null;
        state.posterURL = '';
    }
    function suspendHome() {
        if (!state.homeActive) return;
        // Lampa caches its previous slide. Preserve its decorative geometry so
        // returning cannot flash the unthemed full-size catalogue for a frame.
        state.homeActive = false;
        clearFocus();
        clearCardEvents();
        cancelImage();
        disconnectCard();
        if (state.homeObserver) state.homeObserver.disconnect();
        state.homeObserverRoot = null;
        state.homeObserverMode = '';
    }
    function createHero(root, scroll) {
        var hero = make('section', 'atvp-hero');
        hero.setAttribute('aria-hidden', 'true');
        hero.setAttribute('data-atvp-hero', 'true');
        // One reused, bounded surface copies already decoded native poster
        // pixels. It issues no URL request, CORS readback or full-size preload.
        var poster = make('canvas', 'atvp-hero__art atvp-hero__poster');
        poster.width = 640;
        poster.height = 360;
        poster.style.visibility = 'hidden';
        hero.appendChild(poster);
        var images = [make('img', 'atvp-hero__art'), make('img', 'atvp-hero__art')];
        images.forEach(function (image) {
            image.alt = '';
            image.draggable = false;
            image.decoding = 'async';
            hero.appendChild(image);
        });
        var content = make('div', 'atvp-hero__content');
        content.appendChild(make('div', 'atvp-hero__eyebrow', 'Сейчас в фокусе'));
        var title = make('div', 'atvp-hero__title');
        var meta = make('div', 'atvp-hero__meta');
        var overview = make('div', 'atvp-hero__overview');
        [title, meta, overview].forEach(function (node) { content.appendChild(node); });
        hero.appendChild(content);
        root.appendChild(hero);
        root.classList.add('atvp-home');
        scroll.classList.add('atvp-main-scroll');
        state.scroll = scroll;
        state.hero = hero;
        state.refs = { images: images, poster: poster, title: title, meta: meta, overview: overview };
        // A new DOM must be populated even when the previously selected title
        // has the same metadata signature after returning from a detail page.
        state.heroSignature = '';
        state.imageSlot = 0;
    }
    function cardData(card) {
        if (card.card_data) return card.card_data;
        var jq = jquery();
        return jq ? jq(card).data('card') || {} : {};
    }
    function artwork(data, card) {
        var url = '';
        try {
            if (data.backdrop_path && Lampa.Api && Lampa.Api.img) url = Lampa.Api.img(data.backdrop_path, 'w780');
            else if (data.background_image) url = data.background_image;
            else if (Lampa.Utils && Lampa.Utils.cardImgBackground) url = Lampa.Utils.cardImgBackground(data);
        } catch (ignore) { /* Reuse an already-loaded native poster below. */ }
        if (url) return String(url).replace(/\/t\/p\/(?:original|w\d+)\//, '/t/p/w780/');
        var image = card.querySelector('.card__img');
        url = image && (image.currentSrc || (image.getAttribute('src') && image.src));
        return url && !/img_(?:load|broken)\./.test(url) ? url : '';
    }
    function showNativePoster(card) {
        var canvas = state.refs.poster;
        var image = card.querySelector('.card__img');
        var url = image && (image.currentSrc || (image.getAttribute('src') && image.src));
        var valid = image && image.complete && image.naturalWidth >= 64 && image.naturalHeight > image.naturalWidth * 1.1 &&
            url && !/^(?:data:)|img_(?:load|broken)|placeholder|transparent|\.svg(?:[?#]|$)/i.test(url);
        if (!valid) {
            canvas.classList.remove('atvp-image-visible');
            canvas.style.visibility = 'hidden';
            state.posterCard = null;
            state.posterURL = '';
            return;
        }
        if (state.posterCard !== card || state.posterURL !== url) {
            canvas.classList.remove('atvp-image-visible');
            canvas.style.visibility = 'hidden';
            try {
                var context = canvas.getContext('2d');
                if (!context) return;
                var cropHeight = image.naturalWidth * canvas.height / canvas.width;
                var cropTop = Math.max(0, (image.naturalHeight - cropHeight) * .32);
                context.drawImage(image, 0, cropTop, image.naturalWidth, cropHeight, 0, 0, canvas.width, canvas.height);
                state.posterCard = card;
                state.posterURL = url;
                state.stats.posterCopies++;
            } catch (ignore) {
                canvas.classList.remove('atvp-image-visible');
                canvas.style.visibility = 'hidden';
                state.posterCard = null;
                state.posterURL = '';
                return;
            }
        }
        canvas.style.visibility = 'visible';
        canvas.classList.add('atvp-image-visible');
    }
    function updateImage(card) {
        state.imageTimer = 0;
        if (state.destroyed || !state.homeActive || !state.hero || card !== state.currentCard || !state.root.contains(card) || document.hidden) return;
        var url = artwork(cardData(card), card);
        if (url === state.loadedImageURL) {
            cancelImage();
            state.imageURL = url;
            if (url) {
                state.refs.images[state.imageSlot].style.visibility = 'visible';
                state.refs.images[state.imageSlot].classList.add('atvp-image-visible');
                state.refs.poster.classList.remove('atvp-image-visible');
            }
            return;
        }
        if (state.requestedImage && url === state.imageURL) return;
        if (!url) {
            cancelImage();
            state.imageURL = '';
            state.refs.images.forEach(function (image) { image.classList.remove('atvp-image-visible'); });
            return;
        }
        // A failed request can be retried on a later focus/load/activity event,
        // but never starts an autonomous retry or polling loop.
        if (url === state.failedImageURL && Date.now() < state.imageRetryAfter) return;
        cancelImage();
        state.imageURL = url;
        var nextSlot = 1 - state.imageSlot;
        var image = state.refs.images[nextSlot];
        var requestID = state.imageRequestID;
        state.requestedImage = image;
        image.classList.remove('atvp-image-visible');
        image.onload = function () {
            if (state.destroyed || !state.homeActive || document.hidden || !state.refs || state.imageRequestID !== requestID || state.imageURL !== url || card !== state.currentCard) return;
            state.refs.images[state.imageSlot].classList.remove('atvp-image-visible');
            image.style.visibility = 'visible';
            image.classList.add('atvp-image-visible');
            state.refs.poster.classList.remove('atvp-image-visible');
            state.imageSlot = nextSlot;
            state.loadedImageURL = url;
            state.failedImageURL = '';
            state.imageRetryAfter = 0;
            state.requestedImage = null;
            image.onload = image.onerror = null;
        };
        image.onerror = function () {
            if (state.destroyed || state.imageRequestID !== requestID) return;
            image.classList.remove('atvp-image-visible');
            image.onload = image.onerror = null;
            state.requestedImage = null;
            state.imageURL = '';
            state.failedImageURL = url;
            state.imageRetryAfter = Date.now() + 2500;
        };
        state.stats.imageRequests++;
        image.src = url;
    }
    function updateHero(card) {
        state.focusTimer = 0;
        state.pendingCard = null;
        if (state.destroyed || !state.homeActive || document.hidden || !state.hero || !card || !state.root.contains(card)) return;
        var data = cardData(card);
        var titleNode = card.querySelector('.card__title');
        var title = data.title || data.name || (titleNode && titleNode.textContent) || '';
        state.currentCard = card;
        observeCard(card);
        // The current film's native poster fills the stage immediately while
        // its correct backdrop loads; another film's pixels never linger.
        var desiredArtwork = artwork(data, card);
        if (!desiredArtwork || desiredArtwork !== state.loadedImageURL) {
            state.refs.images.forEach(function (image) {
                image.classList.remove('atvp-image-visible');
                image.style.visibility = 'hidden';
            });
            showNativePoster(card);
        } else {
            state.refs.images[state.imageSlot].style.visibility = 'visible';
            state.refs.images[state.imageSlot].classList.add('atvp-image-visible');
            state.refs.poster.classList.remove('atvp-image-visible');
            state.refs.poster.style.visibility = 'hidden';
        }
        var date = String(data.release_date || data.first_air_date || '');
        var meta = [];
        if (/^\d{4}/.test(date)) meta.push(date.slice(0, 4));
        var rating = Number(data.vote_average || 0);
        if (rating > 0 && isFinite(rating)) meta.push('Рейтинг ' + rating.toFixed(1));
        if (data.original_name || data.first_air_date || data.media_type === 'tv') meta.push('Сериал');
        else if (data.release_date || data.media_type === 'movie') meta.push('Фильм');
        var metaText = meta.join('  ·  ');
        var overview = String(data.overview || data.description || '').replace(/<[^>]*>/g, '').slice(0, 360);
        var signature = [title, metaText, overview].join('\u0000');
        if (signature !== state.heroSignature) {
            setText(state.refs.title, String(title));
            setText(state.refs.meta, metaText);
            setText(state.refs.overview, overview);
            state.refs.meta.hidden = !metaText;
            state.refs.overview.hidden = !overview;
            state.heroSignature = signature;
            state.stats.heroUpdates++;
        }
        window.clearTimeout(state.imageTimer);
        // Metadata reacts promptly; image requests wait for deliberate dwell.
        state.imageTimer = window.setTimeout(function () { updateImage(card); }, 240);
    }
    function queueFocus(card, dirty) {
        if (state.destroyed || !state.homeActive || document.hidden || !card || !state.root || !state.root.contains(card)) return;
        if (card === state.pendingCard) return;
        if (card === state.currentCard && !state.pendingCard && !dirty && (state.imageURL || Date.now() < state.imageRetryAfter)) return;
        clearFocus();
        if (card !== state.currentCard) cancelImage();
        observeCard(card);
        state.pendingCard = card;
        state.focusTimer = paint(function () { updateHero(state.pendingCard); });
    }
    function focusEvent(event) { queueFocus(closest(event.target, '.card')); }
    function remoteKey(event) {
        var code = event.keyCode || event.which;
        if (!state.homeActive || !state.root || !state.hero || document.hidden || state.keyTimer ||
            !((code >= 19 && code <= 22) || (code >= 37 && code <= 40) || /^Arrow(?:Left|Right|Up|Down)$/.test(event.key || ''))) return;
        // Compatibility fallback for custom controllers that only toggle the
        // focus class. One post-navigation read per key burst, never polling.
        state.keyTimer = paint(function () {
            state.keyTimer = 0;
            if (state.destroyed || document.hidden || !state.root) return;
            var card = state.root.querySelector('.card.focus');
            if (card) { bindCardEvents(card); queueFocus(card); }
        });
    }
    function meaningfulInsert(node) {
        if (!node || node.nodeType !== 1 || node.hasAttribute('data-atvp-hero')) return false;
        return (node.matches && node.matches('.card,.scroll,.activity__body,.items-line')) || !!node.querySelector('.card,.scroll');
    }
    function observeHome(root, bootstrap) {
        if (!window.MutationObserver || document.hidden) return;
        var mode = bootstrap ? 'bootstrap' : 'structural';
        if (state.homeObserverRoot === root && state.homeObserverMode === mode) return;
        if (state.homeObserver) state.homeObserver.disconnect();
        window.clearTimeout(state.homeBootstrapTimer);
        state.homeBootstrapTimer = 0;
        state.homeObserverRoot = root;
        state.homeObserverMode = mode;
        if (!state.homeObserver) state.homeObserver = new MutationObserver(function (records) {
            if (state.destroyed || document.hidden) return;
            for (var i = 0; i < records.length; i++) {
                var record = records[i];
                if (closest(record.target, '[data-atvp-hero]')) continue;
                for (var j = 0; j < record.addedNodes.length; j++) {
                    if (meaningfulInsert(record.addedNodes[j])) { scheduleRefresh(); return; }
                }
                for (var k = 0; k < record.removedNodes.length; k++) {
                    if (meaningfulInsert(record.removedNodes[k])) { scheduleRefresh(); return; }
                }
            }
        });
        if (bootstrap) {
            // Bounded fallback for Lampa versions that append the first cards
            // without an activity-ready signal. Afterwards observe only the
            // three structural roots, never the whole catalogue subtree.
            state.homeObserver.observe(root, { childList: true, subtree: true });
            state.homeBootstrapTimer = window.setTimeout(function () {
                state.homeBootstrapTimer = 0;
                if (!state.destroyed && state.root === root) observeHome(root, false);
            }, 20000);
        } else {
            state.homeObserver.observe(root, { childList: true });
            var body = root.querySelector('.activity__body');
            if (body) state.homeObserver.observe(body, { childList: true });
            if (state.scroll) state.homeObserver.observe(state.scroll, { childList: true });
            var content = state.scroll && state.scroll.querySelector('.scroll__content');
            if (content) state.homeObserver.observe(content, { childList: true });
        }
    }
    function observeActivities(root) {
        if (!window.MutationObserver || document.hidden) return;
        var mount = document.querySelector('.activitys') || (root && root.parentNode) || document.body;
        if (state.mount !== mount) {
            if (state.mountObserver) state.mountObserver.disconnect();
            state.mount = mount;
            state.mountObserver = new MutationObserver(scheduleRefresh);
            // Direct activity additions/removals, not every descendant class.
            state.mountObserver.observe(mount, { childList: true });
        }
        if (state.activityObserver) state.activityObserver.disconnect();
        else state.activityObserver = new MutationObserver(function (records) {
            if (records.some(function (record) {
                // Presentation classes are our own writes, not navigation.
                var before = String(record.oldValue || '').replace(/\batvp-(?:home|full)\b/g, '').replace(/\s+/g, ' ').trim();
                var after = String(record.target.className || '').replace(/\batvp-(?:home|full)\b/g, '').replace(/\s+/g, ' ').trim();
                return before !== after;
            })) scheduleRefresh();
        });
        var activities = mount.querySelectorAll('.activity');
        for (var i = 0; i < activities.length; i++) state.activityObserver.observe(activities[i], { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    }
    function hookLampa() {
        var jq = jquery();
        if (jq && !state.jqueryBound) {
            jq(document).on('hover:focus.atvp hover:hover.atvp', '.card', focusEvent);
            state.jqueryBound = true;
            state.jquery = jq;
        }
        if (!window.Lampa || !Lampa.Listener || !Lampa.Listener.follow) return;
        // Lampa versions differ in unsubscribe support. Register one dispatcher
        // per page, then release its callback on destroy (no retained DOM/state).
        var bridge = window.__apple_tv_plus_activity_bridge;
        if (bridge && bridge.version !== 2 && Lampa.Listener.remove) {
            Lampa.Listener.remove('activity', bridge.dispatch);
            Lampa.Listener.remove('app', bridge.dispatch);
            bridge = null;
        }
        if (!bridge) {
            bridge = { callback: null };
            window.__apple_tv_plus_activity_bridge = bridge;
            bridge.version = 2;
            bridge.dispatch = function (event) { if (bridge.callback) bridge.callback(event); };
            Lampa.Listener.follow('activity', bridge.dispatch);
            Lampa.Listener.follow('app', bridge.dispatch);
        }
        bridge.callback = activityEvent;
    }
    function activityEvent(event) {
        if (state.destroyed || document.hidden) return;
        // These signals run after Lampa has made the destination slide active.
        // Apply before the browser paints, not after a 160ms debounce.
        if (event && (event.type === 'start' || event.type === 'archive')) {
            cancelRefresh();
            refresh();
        } else scheduleRefresh();
    }
    function refresh() {
        state.frame = 0;
        if (state.destroyed || document.hidden) return;
        window.clearTimeout(state.bootstrapTimer);
        state.bootstrapTimer = 0;
        state.stats.refreshes++;
        hookLampa();
        var active = activeActivity();
        var root = active && active.root;
        observeActivities(root);
        if (state.fullRoot && active && root && (active.component !== 'full' || state.fullRoot !== root)) {
            state.fullRoot.classList.remove('atvp-full');
            state.fullRoot = null;
        }
        if (active && active.component === 'full' && root && state.fullRoot !== root) {
            root.classList.add('atvp-full');
            state.fullRoot = root;
        }
        if (!active || active.component !== 'main' || !root) {
            if (state.root) {
                if (!state.root.isConnected) detachHome();
                else suspendHome();
            }
            if (!active && state.bootstrapAttempts++ < 30) state.bootstrapTimer = window.setTimeout(function () {
                state.bootstrapTimer = 0;
                scheduleRefresh();
            }, 500);
            return;
        }
        if (state.root !== root) {
            detachHome();
            state.root = root;
            observeHome(root, true);
        }
        var scroll = root.querySelector('.activity__body .scroll');
        var firstCard = root.querySelector('.card');
        if (!scroll || !firstCard) return;
        if (state.hero && state.scroll !== scroll) {
            detachHome();
            state.root = root;
        }
        state.homeActive = true;
        if (!state.hero) createHero(root, scroll);
        pruneCardEvents();
        Array.prototype.forEach.call(root.querySelectorAll('.card'), bindCardEvents);
        observeHome(root, false);
        queueFocus(root.querySelector('.card.focus') || firstCard, true);
    }
    function scheduleRefresh() {
        if (state.destroyed) return;
        if (document.hidden) return;
        if (state.refreshTimer || state.frame) return;
        state.frame = paint(refresh);
    }
    function visibilityChange() {
        if (document.hidden) {
            clearFocus();
            cancelPaint(state.keyTimer);
            state.keyTimer = 0;
            cancelRefresh();
            cancelImage();
            disconnectCard();
            window.clearTimeout(state.homeBootstrapTimer);
            state.homeBootstrapTimer = 0;
            [state.mountObserver, state.activityObserver, state.homeObserver].forEach(function (observer) { if (observer) observer.disconnect(); });
            state.mount = state.homeObserverRoot = null;
            state.homeObserverMode = '';
        }
        else {
            state.currentCard = null;
            scheduleRefresh();
        }
    }
    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        cancelRefresh();
        [state.mountObserver, state.activityObserver, state.homeObserver].forEach(function (observer) { if (observer) observer.disconnect(); });
        detachHome();
        if (state.fullRoot) state.fullRoot.classList.remove('atvp-full');
        state.fullRoot = state.mount = null;
        document.removeEventListener('hover:focus', focusEvent, true);
        document.removeEventListener('hover:hover', focusEvent, true);
        document.removeEventListener('focusin', focusEvent, true);
        document.removeEventListener('keydown', remoteKey, true);
        document.removeEventListener('visibilitychange', visibilityChange);
        document.removeEventListener('DOMContentLoaded', start);
        if (state.jquery && state.jqueryBound) state.jquery(document).off('hover:focus.atvp hover:hover.atvp', '.card', focusEvent);
        state.jqueryBound = false;
        state.jquery = null;
        var bridge = window.__apple_tv_plus_activity_bridge;
        if (bridge && bridge.callback === activityEvent) bridge.callback = null;
        var style = document.getElementById(STYLE_ID);
        if (style && style.parentNode) style.parentNode.removeChild(style);
        if (document.body) document.body.classList.remove('atvp-ui');
    }
    state.destroy = destroy;
    state.refresh = scheduleRefresh;

    function start() {
        if (state.destroyed || state.started || !document.body) return;
        state.started = true;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        document.body.classList.add('atvp-ui');
        document.addEventListener('hover:focus', focusEvent, true);
        document.addEventListener('hover:hover', focusEvent, true);
        document.addEventListener('focusin', focusEvent, true);
        document.addEventListener('keydown', remoteKey, true);
        document.addEventListener('visibilitychange', visibilityChange);
        scheduleRefresh();
        console.info('AppleTVPlusUI ready', VERSION);
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
//# sourceURL=apple_tv_plus_ui.js
