/*
 * Apple TV+ presentation for Lampa 1.2.3 — Android TV / low-paint edition.
 * Local presentation only: no Storage writes, accounts, API overrides, telemetry,
 * controller replacement, fabricated media capabilities or external dependencies.
 * DOM references: yumata/lampa-source components/full/start.js,
 * templates/full/start_new.js and components/full.js (audited 2026-11-07).
 * Rollback: disable this plugin and restart Lampa, or call its destroy() method.
 */
(function () {
    'use strict';

    var VERSION = '1.2.3';
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
        root: null, fullRoot: null, hero: null, scroll: null, refs: null,
        currentCard: null, pendingCard: null, observedCard: null, heroSignature: '',
        imageURL: '', loadedImageURL: '', imageSlot: 0, requestedImage: null,
        imageRequestID: 0, failedImageURL: '', imageRetryAfter: 0,
        refreshTimer: 0, focusTimer: 0, imageTimer: 0, bootstrapTimer: 0, keyTimer: 0,
        frame: 0, bootstrapAttempts: 0, mount: null,
        mountObserver: null, activityObserver: null, homeObserver: null, cardObserver: null,
        homeObserverRoot: null, homeObserverMode: '',
        homeBootstrapTimer: 0, jqueryBound: false, jquery: null, boundCards: [], boundCardSet: new WeakSet(),
        stats: { refreshes: 0, heroUpdates: 0, imageRequests: 0 }
    };
    window.__apple_tv_plus_ui = state;

    var css = /* ATVP_THEME_CSS */ "";

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
        window.clearTimeout(state.focusTimer);
        window.clearTimeout(state.imageTimer);
        state.focusTimer = state.imageTimer = 0;
        state.pendingCard = null;
    }
    function clearCardEvents() {
        state.boundCards.forEach(function (entry) {
            entry.card.removeEventListener('hover:focus', focusEvent);
            entry.card.removeEventListener('hover:hover', focusEvent);
            if (entry.jquery) entry.jquery(entry.card).off('.atvp-card');
        });
        state.boundCards = [];
        state.boundCardSet = new WeakSet();
        window.clearTimeout(state.keyTimer);
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
        window.clearTimeout(state.frame);
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(state.frame);
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
        if (!state.destroyed && !document.hidden && state.observedCard) queueFocus(state.observedCard, true);
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
        if (state.hero && state.hero.parentNode) state.hero.parentNode.removeChild(state.hero);
        state.root = state.scroll = state.hero = state.refs = state.currentCard = null;
        state.imageURL = state.loadedImageURL = state.heroSignature = '';
        state.failedImageURL = '';
        state.imageRetryAfter = 0;
    }
    function createHero(root, scroll) {
        var hero = make('section', 'atvp-hero');
        hero.setAttribute('aria-hidden', 'true');
        hero.setAttribute('data-atvp-hero', 'true');
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
        state.refs = { images: images, title: title, meta: meta, overview: overview };
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
    function updateImage(card) {
        state.imageTimer = 0;
        if (state.destroyed || !state.hero || card !== state.currentCard || !state.root.contains(card) || document.hidden) return;
        var url = artwork(cardData(card), card);
        if (url === state.loadedImageURL) {
            cancelImage();
            state.imageURL = url;
            if (url) state.refs.images[state.imageSlot].classList.add('atvp-image-visible');
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
            if (state.destroyed || document.hidden || !state.refs || state.imageRequestID !== requestID || state.imageURL !== url || card !== state.currentCard) return;
            state.refs.images[state.imageSlot].classList.remove('atvp-image-visible');
            image.classList.add('atvp-image-visible');
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
        if (state.destroyed || document.hidden || !state.hero || !card || !state.root.contains(card)) return;
        var data = cardData(card);
        var titleNode = card.querySelector('.card__title');
        var title = data.title || data.name || (titleNode && titleNode.textContent) || '';
        state.currentCard = card;
        observeCard(card);
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
        if (state.destroyed || document.hidden || !card || !state.root || !state.root.contains(card)) return;
        if (card === state.pendingCard) return;
        if (card === state.currentCard && !state.pendingCard && !dirty && (state.imageURL || Date.now() < state.imageRetryAfter)) return;
        clearFocus();
        if (card !== state.currentCard) cancelImage();
        observeCard(card);
        state.pendingCard = card;
        state.focusTimer = window.setTimeout(function () { updateHero(card); }, 65);
    }
    function focusEvent(event) { queueFocus(closest(event.target, '.card')); }
    function remoteKey(event) {
        var code = event.keyCode || event.which;
        if (!state.root || !state.hero || document.hidden || state.keyTimer ||
            !((code >= 19 && code <= 22) || (code >= 37 && code <= 40) || /^Arrow(?:Left|Right|Up|Down)$/.test(event.key || ''))) return;
        // Compatibility fallback for custom controllers that only toggle the
        // focus class. One post-navigation read per key burst, never polling.
        state.keyTimer = window.setTimeout(function () {
            state.keyTimer = 0;
            if (state.destroyed || document.hidden || !state.root) return;
            var card = state.root.querySelector('.card.focus');
            if (card) { bindCardEvents(card); queueFocus(card); }
        }, 65);
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
        if (!bridge) {
            bridge = { callback: null };
            window.__apple_tv_plus_activity_bridge = bridge;
            bridge.dispatch = function () { if (bridge.callback) bridge.callback(); };
            Lampa.Listener.follow('activity', bridge.dispatch);
            Lampa.Listener.follow('app', bridge.dispatch);
        }
        bridge.callback = scheduleRefresh;
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
        if (state.fullRoot && (!active || active.component !== 'full' || state.fullRoot !== root)) {
            state.fullRoot.classList.remove('atvp-full');
            state.fullRoot = null;
        }
        if (active && active.component === 'full' && root && state.fullRoot !== root) {
            root.classList.add('atvp-full');
            state.fullRoot = root;
        }
        if (!active || active.component !== 'main' || !root) {
            if (state.root) detachHome();
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
        if (!state.hero) createHero(root, scroll);
        Array.prototype.forEach.call(root.querySelectorAll('.card'), bindCardEvents);
        observeHome(root, false);
        queueFocus(root.querySelector('.card.focus') || firstCard, true);
    }
    function scheduleRefresh() {
        if (state.destroyed) return;
        if (document.hidden) return;
        if (state.refreshTimer || state.frame) return;
        state.refreshTimer = window.setTimeout(function () {
            state.refreshTimer = 0;
            state.frame = window.requestAnimationFrame ? window.requestAnimationFrame(refresh) : window.setTimeout(refresh, 16);
        }, 160);
    }
    function visibilityChange() {
        if (document.hidden) {
            clearFocus();
            window.clearTimeout(state.keyTimer);
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
        if (bridge && bridge.callback === scheduleRefresh) bridge.callback = null;
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
