/*
 * Apple TV+ presentation for Lampa 1.1.0 — Android TV / low-paint edition.
 * Local presentation only: no Storage writes, accounts, API overrides, telemetry,
 * controller replacement, fabricated media capabilities or external dependencies.
 * DOM references: yumata/lampa-source components/full/start.js,
 * templates/full/start_new.js and components/full.js (audited 2026-11-07).
 * Rollback: disable this plugin and restart Lampa, or call its destroy() method.
 */
(function () {
    'use strict';

    var VERSION = '1.1.0';
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
        currentCard: null, pendingCard: null, imageURL: '', imageSlot: 0,
        refreshTimer: 0, focusTimer: 0, imageTimer: 0, bootstrapTimer: 0,
        frame: 0, bootstrapAttempts: 0, mount: null,
        mountObserver: null, activityObserver: null, homeObserver: null,
        stats: { refreshes: 0, heroUpdates: 0, imageRequests: 0 }
    };
    window.__apple_tv_plus_ui = state;

    var css = [
        'body.atvp-ui{background:#090b10!important;color:#f4f5f7!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}',
        'body.atvp-ui .background{opacity:.35!important}',
        'body.atvp-ui .head{background:linear-gradient(180deg,#10131bf5,#10131be8)!important;border-bottom:1px solid #ffffff0c}',
        'body.atvp-ui .head__body{background:transparent!important}',
        'body.atvp-ui .head__logo-icon{width:2.6em;height:2.6em;position:relative;display:flex;align-items:center;justify-content:center;border-radius:.8em;background:#ffffff0d}',
        'body.atvp-ui .head__logo-icon>img{opacity:0!important}',
        'body.atvp-ui .head__logo-icon:after{content:"TV+";position:absolute;font-size:1em;font-weight:700;letter-spacing:-.06em;color:#f4f5f7;pointer-events:none}',
        'body.atvp-ui .head__title{font-weight:600;letter-spacing:-.025em}',
        'body.atvp-ui .head__time-now{font-size:1.7em!important;font-weight:400;letter-spacing:-.04em}',
        'body.atvp-ui .head__time-date,body.atvp-ui .head__time-week{font-size:.85em;color:#b3b8c3}',
        'body.atvp-ui .head__action{border-radius:50%!important;transition:transform .14s ease,opacity .14s ease!important}',
        'body.atvp-ui .head__action.focus{background:#f4f5f7!important;color:#10131b!important;transform:scale(1.04);will-change:transform}',
        'body.atvp-ui .menu,body.atvp-ui .settings__content,body.atvp-ui .selectbox__content,body.atvp-ui .modal__content,body.atvp-ui .context-menu{background:#151922fa!important;border:1px solid #ffffff1f;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
        'body.atvp-ui .head{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
        'body.atvp-ui .settings__content,body.atvp-ui .selectbox__content,body.atvp-ui .modal__content{border-radius:20px!important}',
        'body.atvp-ui .menu__item,body.atvp-ui .settings-param,body.atvp-ui .selectbox-item{border-radius:12px!important}',
        'body.atvp-ui .menu__item.focus,body.atvp-ui .settings-param.focus,body.atvp-ui .selectbox-item.focus{background:#f4f5f7!important;color:#10131b!important}',
        'body.atvp-ui .card{transition:transform .15s cubic-bezier(.2,.7,.3,1)!important;transform-origin:center center}',
        'body.atvp-ui .card__img,body.atvp-ui .card__view,body.atvp-ui .card__filter{border-radius:14px!important}',
        'body.atvp-ui .card__view{box-shadow:none!important;transition:none!important}',
        'body.atvp-ui .card.focus,body.atvp-ui .card.hover{transform:scale(1.035)!important;z-index:2;will-change:transform}',
        'body.atvp-ui .card .card__view:after{content:"";position:absolute;top:-3px!important;left:-3px!important;right:-3px!important;bottom:-3px!important;border:2px solid #fff!important;border-radius:17px!important;box-shadow:none!important;pointer-events:none;z-index:3!important;opacity:0;transition:opacity .12s ease!important}',
        'body.atvp-ui .card.focus .card__view:after,body.atvp-ui .card.hover .card__view:after{opacity:1}',
        'body.atvp-ui .card__title{font-size:1.05em!important;font-weight:500;letter-spacing:-.015em;line-height:1.28;-webkit-line-clamp:2!important}',
        'body.atvp-ui .card__age{font-size:.85em;color:#a8afbc}',
        'body.atvp-ui .card__vote,body.atvp-ui .card__quality>div,body.atvp-ui .card__type{background:#10131bea!important;color:#f4f5f7!important;border:1px solid #ffffff14;border-radius:6px!important}',
        'body.atvp-ui .items-line__title,body.atvp-ui .category-full__title{font-weight:600!important;letter-spacing:-.025em}',
        'body.atvp-ui .full-start__button,body.atvp-ui .simple-button{border-radius:.8em!important;transition:transform .14s ease,opacity .14s ease!important;box-shadow:none!important}',
        'body.atvp-ui .full-start__button.focus,body.atvp-ui .simple-button.focus{background:#f4f5f7!important;color:#10131b!important;transform:scale(1.025);will-change:transform}',
        'body.atvp-ui .full-start__poster,body.atvp-ui .full-start__img,body.atvp-ui .full-start-new__poster,body.atvp-ui .full-start-new__img{border-radius:1em!important}',
        'body.atvp-ui .atvp-full .full-start-new{position:relative;background:linear-gradient(90deg,#090b10c9,#090b1059 75%,#090b1000);border-radius:1em}',
        'body.atvp-ui .atvp-full .full-start-new__body{align-items:flex-start;gap:2em}',
        'body.atvp-ui .atvp-full .full-start-new__right{min-width:0}',
        'body.atvp-ui .atvp-full .full-start-new__poster{border:1px solid #ffffff1a;box-shadow:none!important}',
        'body.atvp-ui .atvp-full .full-start-new__head{font-size:.9em;color:#bdc3ce;letter-spacing:.025em;margin-bottom:.65em}',
        'body.atvp-ui .atvp-full .full-start-new__title{font-size:3.15em!important;font-weight:650;line-height:1.08!important;letter-spacing:-.04em;white-space:normal!important;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-height:2.2em}',
        'body.atvp-ui .atvp-full .full-start-new__tagline{font-size:1.1em!important;line-height:1.4;color:#d0d4dc;margin-top:.65em;max-height:2.8em;overflow:hidden}',
        'body.atvp-ui .atvp-full .full-start-new__rate-line{display:flex;align-items:center;flex-wrap:wrap;gap:.5em;margin:1em 0 .85em}',
        'body.atvp-ui .atvp-full .full-start__rate,body.atvp-ui .atvp-full .full-start__pg,body.atvp-ui .atvp-full .full-start__status{margin:0!important;border:1px solid #ffffff29;border-radius:.4em;background:#131820d9;line-height:1.2;padding:.28em .5em}',
        'body.atvp-ui .atvp-full .full-start__rate>div:first-child{font-weight:650}',
        'body.atvp-ui .atvp-full .full-start__rate>div+div{font-size:.7em;letter-spacing:.035em;color:#c0c7d3}',
        'body.atvp-ui .atvp-full .full-start__pg,body.atvp-ui .atvp-full .full-start__status{font-size:.82em;letter-spacing:.02em}',
        'body.atvp-ui .atvp-full .tag--quality>div,body.atvp-ui .atvp-full .full-start__quality{border:1px solid #ffffff40;border-radius:.35em;padding:.2em .4em;font-weight:600;letter-spacing:.04em}',
        'body.atvp-ui .atvp-full .full-start-new__details{font-size:.9em;line-height:1.65;color:#c2c8d3;margin:.75em 0}',
        'body.atvp-ui .atvp-full .full-start-new__split{opacity:.45;padding:0 .45em}',
        'body.atvp-ui .atvp-full .full-start-new__reactions{font-size:.87em;opacity:.9}',
        'body.atvp-ui .atvp-full .full-start-new__buttons{display:flex;align-items:center;flex-wrap:wrap;gap:.65em;margin-top:1.2em}',
        'body.atvp-ui .atvp-full .full-start-new__buttons>.full-start__button{margin:0!important;min-height:2.9em;background:#ffffff12;border:1px solid #ffffff1a}',
        'body.atvp-ui .atvp-full .full-start-new__buttons>.button--play{font-weight:600}',
        'body.atvp-ui .atvp-full .full-start__background{filter:none!important;-webkit-filter:none!important;transition:opacity .24s ease!important;opacity:0}',
        'body.atvp-ui .atvp-full .full-start__background.loaded{opacity:.56}',
        'body.atvp-ui .atvp-full .full-start__background.dim{opacity:.14}',
        'body.atvp-ui .atvp-home{--atvp-hero-height:33vh}',
        'body.atvp-ui .atvp-home>.activity__body{height:100%!important}',
        'body.atvp-ui .atvp-main-scroll{position:absolute!important;top:var(--atvp-hero-height)!important;left:0;right:0;bottom:0;height:calc(100% - var(--atvp-hero-height))!important}',
        'body.atvp-ui .atvp-main-scroll>.scroll__content{padding-top:1.6em!important}',
        'body.atvp-ui .atvp-hero{position:absolute;left:0;top:0;right:0;height:var(--atvp-hero-height);overflow:hidden;isolation:isolate;pointer-events:none;z-index:1;background:linear-gradient(115deg,#171e2b,#0a0d14 80%);border-radius:0 0 20px 20px}',
        'body.atvp-ui .atvp-hero__art{position:absolute;right:0;top:0;width:74%;height:100%;object-fit:cover;object-position:50% 35%;opacity:0;transition:opacity .2s ease}',
        'body.atvp-ui .atvp-hero__art.atvp-image-visible{opacity:.68}',
        'body.atvp-ui .atvp-hero:after{content:"";position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,#090b10 1%,#090b10e8 25%,#090b102e 76%),linear-gradient(0deg,#090b10,transparent 55%);z-index:1}',
        'body.atvp-ui .atvp-hero__content{position:absolute;left:2.25em;right:29%;top:50%;transform:translateY(-50%);z-index:2}',
        'body.atvp-ui .atvp-hero__eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:.65em;font-weight:600;color:#adb6c6;margin-bottom:.7em}',
        'body.atvp-ui .atvp-hero__title{font-size:2.4em;line-height:1.08;letter-spacing:-.04em;font-weight:650;max-height:2.2em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
        'body.atvp-ui .atvp-hero__meta{font-size:.78em;line-height:1.45;color:#b9c1ce;margin-top:.75em}',
        'body.atvp-ui .atvp-hero__overview{font-size:.88em;line-height:1.45;color:#d7dce5;margin-top:.65em;max-width:37em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
        '@media(max-height:600px){body.atvp-ui .atvp-hero__overview{-webkit-line-clamp:1}body.atvp-ui .atvp-hero__title{font-size:2.1em}body.atvp-ui .atvp-full .full-start-new__title{font-size:2.75em!important}body.atvp-ui .atvp-full .full-start-new__buttons{margin-top:.85em}}',
        '@media(prefers-reduced-motion:reduce){body.atvp-ui .card,body.atvp-ui .card__view:after,body.atvp-ui .head__action,body.atvp-ui .full-start__button,body.atvp-ui .simple-button,body.atvp-ui .atvp-hero__art,body.atvp-ui .full-start__background{transition:none!important}body.atvp-ui .card.focus,body.atvp-ui .card.hover,body.atvp-ui .full-start__button.focus{transform:none!important;will-change:auto!important}}',
        'body.atvp-ui.no--animation .card,body.atvp-ui.no--animation .card__view:after,body.atvp-ui.no--animation .head__action,body.atvp-ui.no--animation .full-start__button,body.atvp-ui.no--animation .simple-button,body.atvp-ui.no--animation .atvp-hero__art,body.atvp-ui.no--animation .full-start__background{transition:none!important}',
        'body.atvp-ui.no--animation .card.focus,body.atvp-ui.no--animation .card.hover{transform:none!important;will-change:auto!important}'
    ].join('\n');

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
    function detachHome() {
        clearFocus();
        if (state.homeObserver) state.homeObserver.disconnect();
        if (state.root) state.root.classList.remove('atvp-home');
        if (state.scroll) state.scroll.classList.remove('atvp-main-scroll');
        if (state.refs) state.refs.images.forEach(function (image) {
            image.onload = image.onerror = null;
            image.removeAttribute('src');
        });
        if (state.hero && state.hero.parentNode) state.hero.parentNode.removeChild(state.hero);
        state.root = state.scroll = state.hero = state.refs = state.currentCard = null;
        state.imageURL = '';
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
        state.imageSlot = 0;
    }
    function cardData(card) {
        if (card.card_data) return card.card_data;
        return window.jQuery ? window.jQuery(card).data('card') || {} : {};
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
        url = image && (image.currentSrc || image.src);
        return url && !/img_(?:load|broken)\./.test(url) ? url : '';
    }
    function updateImage(card) {
        state.imageTimer = 0;
        if (state.destroyed || !state.hero || card !== state.currentCard || !state.root.contains(card) || document.hidden) return;
        var url = artwork(cardData(card), card);
        if (url === state.imageURL) return;
        state.imageURL = url;
        if (!url) {
            state.refs.images.forEach(function (image) { image.classList.remove('atvp-image-visible'); });
            return;
        }
        var nextSlot = 1 - state.imageSlot;
        var image = state.refs.images[nextSlot];
        image.classList.remove('atvp-image-visible');
        image.onload = function () {
            if (state.destroyed || !state.refs || state.imageURL !== url || card !== state.currentCard) return;
            state.refs.images[state.imageSlot].classList.remove('atvp-image-visible');
            image.classList.add('atvp-image-visible');
            state.imageSlot = nextSlot;
        };
        image.onerror = function () { image.classList.remove('atvp-image-visible'); };
        state.stats.imageRequests++;
        image.src = url;
    }
    function updateHero(card) {
        state.focusTimer = 0;
        state.pendingCard = null;
        if (state.destroyed || !state.hero || !card || !state.root.contains(card)) return;
        var data = cardData(card);
        var titleNode = card.querySelector('.card__title');
        var title = data.title || data.name || (titleNode && titleNode.textContent) || '';
        if (!title) return;
        state.currentCard = card;
        var date = data.release_date || data.first_air_date || '';
        var meta = [];
        if (/^\d{4}/.test(date)) meta.push(date.slice(0, 4));
        var rating = Number(data.vote_average || 0);
        if (rating > 0 && isFinite(rating)) meta.push('Рейтинг ' + rating.toFixed(1));
        if (data.original_name || data.first_air_date || data.media_type === 'tv') meta.push('Сериал');
        else if (data.release_date || data.media_type === 'movie') meta.push('Фильм');
        setText(state.refs.title, String(title));
        setText(state.refs.meta, meta.join('  ·  '));
        setText(state.refs.overview, String(data.overview || data.description || '').replace(/<[^>]*>/g, '').slice(0, 360));
        state.stats.heroUpdates++;
        window.clearTimeout(state.imageTimer);
        // Metadata reacts promptly; image requests wait for deliberate dwell.
        state.imageTimer = window.setTimeout(function () { updateImage(card); }, 240);
    }
    function queueFocus(card) {
        if (state.destroyed || !card || !state.root || !state.root.contains(card)) return;
        if (card === state.pendingCard || (card === state.currentCard && !state.pendingCard)) return;
        clearFocus();
        state.pendingCard = card;
        state.focusTimer = window.setTimeout(function () { updateHero(card); }, 65);
    }
    function focusEvent(event) { queueFocus(closest(event.target, '.card')); }
    function meaningfulInsert(node) {
        if (!node || node.nodeType !== 1 || node.hasAttribute('data-atvp-hero')) return false;
        return (node.matches && node.matches('.card,.scroll,.activity__body,.items-line')) || !!node.querySelector('.card,.scroll');
    }
    function observeHome(root) {
        if (!window.MutationObserver) return;
        if (!state.homeObserver) state.homeObserver = new MutationObserver(function (records) {
            if (state.destroyed) return;
            for (var i = 0; i < records.length; i++) {
                var record = records[i];
                if (closest(record.target, '[data-atvp-hero]')) continue;
                var card = closest(record.target, '.card');
                if (card && (!state.currentCard || card === state.currentCard || card === state.pendingCard)) { scheduleRefresh(); return; }
                for (var j = 0; j < record.addedNodes.length; j++) {
                    if (meaningfulInsert(record.addedNodes[j])) { scheduleRefresh(); return; }
                }
            }
        });
        state.homeObserver.observe(root, { childList: true, subtree: true });
    }
    function observeActivities(root) {
        if (!window.MutationObserver) return;
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
            if (records.some(function (record) { return record.oldValue !== record.target.className; })) scheduleRefresh();
        });
        var activities = mount.querySelectorAll('.activity');
        for (var i = 0; i < activities.length; i++) state.activityObserver.observe(activities[i], { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    }
    function hookLampa() {
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
        if (state.destroyed) return;
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
            if (!active && state.bootstrapAttempts++ < 10) state.bootstrapTimer = window.setTimeout(scheduleRefresh, 500);
            return;
        }
        if (state.root !== root) {
            detachHome();
            state.root = root;
            observeHome(root);
        }
        var scroll = root.querySelector('.activity__body .scroll');
        var firstCard = root.querySelector('.card');
        if (!scroll || !firstCard) return;
        if (!state.hero) createHero(root, scroll);
        queueFocus(root.querySelector('.card.focus') || firstCard);
    }
    function scheduleRefresh() {
        if (state.destroyed || state.refreshTimer || state.frame) return;
        state.refreshTimer = window.setTimeout(function () {
            state.refreshTimer = 0;
            state.frame = window.requestAnimationFrame ? window.requestAnimationFrame(refresh) : window.setTimeout(refresh, 16);
        }, 160);
    }
    function visibilityChange() {
        if (document.hidden) clearFocus();
        else {
            state.currentCard = null;
            scheduleRefresh();
        }
    }
    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        window.clearTimeout(state.refreshTimer);
        window.clearTimeout(state.bootstrapTimer);
        window.clearTimeout(state.frame);
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(state.frame);
        [state.mountObserver, state.activityObserver, state.homeObserver].forEach(function (observer) { if (observer) observer.disconnect(); });
        detachHome();
        if (state.fullRoot) state.fullRoot.classList.remove('atvp-full');
        state.fullRoot = state.mount = null;
        document.removeEventListener('hover:focus', focusEvent, true);
        document.removeEventListener('focusin', focusEvent, true);
        document.removeEventListener('visibilitychange', visibilityChange);
        document.removeEventListener('DOMContentLoaded', start);
        if (window.jQuery) window.jQuery(document).off('hover:focus.atvp', '.card', focusEvent);
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
        document.addEventListener('focusin', focusEvent, true);
        document.addEventListener('visibilitychange', visibilityChange);
        if (window.jQuery) window.jQuery(document).on('hover:focus.atvp', '.card', focusEvent);
        scheduleRefresh();
        console.info('AppleTVPlusUI ready', VERSION);
    }
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
})();
//# sourceURL=apple_tv_plus_ui.js
