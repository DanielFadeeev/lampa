/*
 * Apple TV+ UI for Lampa — personal, local presentation plugin.
 * Uses Lampa's existing cards, artwork URLs and navigation. No Storage writes,
 * API overrides, analytics, external libraries or additional focusable controls.
 * DOM/API reference: yumata/lampa-source, main 3c658ffb4047d62a605389a1039281288836d6b8.
 */
(function () {
    'use strict';

    var VERSION = '1.0.0';
    var STYLE_ID = 'apple-tv-plus-ui-style';
    var HERO_CLASS = 'atvp-hero';
    if (window.__apple_tv_plus_ui) return;

    var state = {
        version: VERSION,
        root: null,
        hero: null,
        scroll: null,
        refreshTimer: 0,
        focusTimer: 0,
        pendingCard: null,
        imageURL: '',
        observer: null
    };
    window.__apple_tv_plus_ui = state;

    var css = [
        'body.atvp-ui{background:#090a0e!important;color:#f5f5f7!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}',
        'body.atvp-ui .background{opacity:.42!important}',
        'body.atvp-ui .head{background:linear-gradient(180deg,rgba(9,10,14,.93),rgba(9,10,14,.45))!important;border-bottom:1px solid rgba(255,255,255,.06)}',
        'body.atvp-ui .head__body{background:transparent!important}',
        'body.atvp-ui .head__logo-icon{width:2.6em;height:2.6em;position:relative;display:flex;align-items:center;justify-content:center;border-radius:.8em;background:rgba(255,255,255,.06)}',
        'body.atvp-ui .head__logo-icon>img{opacity:0!important}',
        'body.atvp-ui .head__logo-icon:after{content:"TV+";position:absolute;font-size:1em;font-weight:700;letter-spacing:-.06em;color:#f5f5f7;pointer-events:none}',
        'body.atvp-ui .head__title{font-weight:600;letter-spacing:-.025em}',
        'body.atvp-ui .head__time-now{font-size:1.7em!important;font-weight:400;letter-spacing:-.04em}',
        'body.atvp-ui .head__time-date,body.atvp-ui .head__time-week{font-size:.85em;color:rgba(245,245,247,.58)}',
        'body.atvp-ui .head__action{border-radius:50%!important;transition:background .18s ease,transform .18s ease}',
        'body.atvp-ui .head__action.focus{background:#f5f5f7!important;color:#101116!important;transform:scale(1.06)}',
        'body.atvp-ui .menu,body.atvp-ui .settings__content,body.atvp-ui .selectbox__content,body.atvp-ui .modal__content,body.atvp-ui .context-menu{background:rgba(20,22,29,.94)!important;border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 60px rgba(0,0,0,.35)}',
        'body.atvp-ui .settings__content,body.atvp-ui .selectbox__content,body.atvp-ui .modal__content{border-radius:24px!important}',
        'body.atvp-ui .menu__item,body.atvp-ui .settings-param,body.atvp-ui .selectbox-item{border-radius:12px!important}',
        'body.atvp-ui .menu__item.focus,body.atvp-ui .settings-param.focus,body.atvp-ui .selectbox-item.focus{background:rgba(255,255,255,.94)!important;color:#111218!important}',
        'body.atvp-ui .card{transition:transform .20s cubic-bezier(.2,.75,.25,1)!important;transform-origin:center center}',
        'body.atvp-ui .card__img,body.atvp-ui .card__view,body.atvp-ui .card__filter{border-radius:18px!important}',
        'body.atvp-ui .card__view{box-shadow:0 10px 28px rgba(0,0,0,.24);transition:box-shadow .20s ease!important}',
        'body.atvp-ui .card.focus,body.atvp-ui .card.hover{transform:scale(1.055)!important;z-index:2}',
        'body.atvp-ui .card.focus .card__view,body.atvp-ui .card.hover .card__view{box-shadow:0 15px 38px rgba(0,0,0,.52)}',
        'body.atvp-ui .card.focus .card__view:after,body.atvp-ui .card.hover .card__view:after{content:"";position:absolute;inset:-4px!important;top:-4px!important;left:-4px!important;right:-4px!important;bottom:-4px!important;border:3px solid #fff!important;border-radius:22px!important;box-shadow:0 0 0 1px rgba(255,255,255,.10);pointer-events:none;z-index:3!important}',
        'body.atvp-ui .card__title{font-size:1.08em!important;font-weight:500;letter-spacing:-.02em;line-height:1.25; -webkit-line-clamp:2!important}',
        'body.atvp-ui .card__age{font-size:.85em;color:rgba(245,245,247,.52)}',
        'body.atvp-ui .card__vote,body.atvp-ui .card__quality>div,body.atvp-ui .card__type{background:rgba(15,16,21,.86)!important;color:#f5f5f7!important;border-radius:7px!important}',
        'body.atvp-ui .items-line__title,body.atvp-ui .category-full__title{font-weight:600!important;letter-spacing:-.025em}',
        'body.atvp-ui .full-start__button,body.atvp-ui .simple-button{border-radius:12px!important;transition:transform .18s ease,background .18s ease}',
        'body.atvp-ui .full-start__button.focus,body.atvp-ui .simple-button.focus{background:#f5f5f7!important;color:#111218!important}',
        'body.atvp-ui .full-start__poster,body.atvp-ui .full-start__img{border-radius:18px!important}',
        'body.atvp-ui .atvp-home{--atvp-hero-height:35vh}',
        'body.atvp-ui .atvp-home>.activity__body{height:100%!important}',
        'body.atvp-ui .atvp-main-scroll{position:absolute!important;top:var(--atvp-hero-height)!important;left:0;right:0;bottom:0;height:calc(100% - var(--atvp-hero-height))!important}',
        'body.atvp-ui .atvp-main-scroll>.scroll__content{padding-top:1.7em!important}',
        'body.atvp-ui .atvp-hero{position:absolute;left:0;top:0;right:0;height:var(--atvp-hero-height);overflow:hidden;isolation:isolate;pointer-events:none;z-index:1;background:linear-gradient(115deg,#171b26,#0a0c13 80%);border-radius:0 0 24px 24px}',
        'body.atvp-ui .atvp-hero__art{position:absolute;right:0;top:0;width:74%;height:100%;object-fit:cover;object-position:50% 35%;opacity:.72;transition:opacity .24s ease}',
        'body.atvp-ui .atvp-hero__art.atvp-image-wait{opacity:0}',
        'body.atvp-ui .atvp-hero:after{content:"";position:absolute;inset:0;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,#090a0e 1%,rgba(9,10,14,.90) 24%,rgba(9,10,14,.18) 76%),linear-gradient(0deg,#090a0e 0%,rgba(9,10,14,0) 45%);z-index:1}',
        'body.atvp-ui .atvp-hero__content{position:absolute;left:2.25em;right:30%;top:50%;transform:translateY(-50%);z-index:2}',
        'body.atvp-ui .atvp-hero__eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:.68em;font-weight:600;color:rgba(245,245,247,.60);margin-bottom:.8em}',
        'body.atvp-ui .atvp-hero__title{font-size:2.5em;line-height:1.06;letter-spacing:-.045em;font-weight:650;max-height:2.2em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;text-shadow:0 2px 18px rgba(0,0,0,.35)}',
        'body.atvp-ui .atvp-hero__meta{font-size:.78em;line-height:1.4;color:rgba(245,245,247,.66);margin-top:.8em}',
        'body.atvp-ui .atvp-hero__overview{font-size:.9em;font-weight:400;line-height:1.4;color:rgba(245,245,247,.82);margin-top:.7em;max-width:37em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
        '@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){body.atvp-ui .head,body.atvp-ui .menu,body.atvp-ui .settings__content,body.atvp-ui .selectbox__content,body.atvp-ui .modal__content{background-color:rgba(20,22,29,.78)!important;backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px)}}',
        '@media (max-height:600px){body.atvp-ui .atvp-hero__overview{-webkit-line-clamp:1}body.atvp-ui .atvp-hero__title{font-size:2.2em}}',
        '@media (prefers-reduced-motion:reduce){body.atvp-ui .card,body.atvp-ui .card__view,body.atvp-ui .head__action,body.atvp-ui .atvp-hero__art{transition:none!important}body.atvp-ui .card.focus,body.atvp-ui .card.hover{transform:scale(1.015)!important}}',
        'body.atvp-ui.no--animation .card,body.atvp-ui.no--animation .card__view{transition:none!important}'
    ].join('\n');

    function element(value) {
        if (!value) return null;
        if (value.nodeType === 1) return value;
        if (value[0] && value[0].nodeType === 1) return value[0];
        return null;
    }

    function closest(node, selector) {
        if (!node || node.nodeType !== 1) return null;
        return node.closest ? node.closest(selector) : null;
    }

    function activeHome() {
        try {
            var active = window.Lampa && Lampa.Activity && Lampa.Activity.active();
            if (!active || active.component !== 'main') return null;
            return element(active.activity && active.activity.render(true)) ||
                document.querySelector('.activity--active');
        } catch (ignore) {
            return null;
        }
    }

    function make(tag, className, text) {
        var node = document.createElement(tag);
        node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function detachHome() {
        if (state.root) state.root.classList.remove('atvp-home');
        if (state.scroll) state.scroll.classList.remove('atvp-main-scroll');
        if (state.hero && state.hero.parentNode) state.hero.parentNode.removeChild(state.hero);
        state.root = state.scroll = state.hero = null;
        state.imageURL = '';
    }

    function createHero(root, scroll) {
        var hero = make('section', HERO_CLASS);
        hero.setAttribute('aria-hidden', 'true');
        hero.setAttribute('data-atvp-hero', 'true');
        // This is presentation, never a selector or a replacement controller.
        var image = make('img', 'atvp-hero__art atvp-image-wait');
        image.alt = '';
        image.draggable = false;
        image.onload = function () { image.classList.remove('atvp-image-wait'); };
        image.onerror = function () { image.classList.add('atvp-image-wait'); };
        var content = make('div', 'atvp-hero__content');
        content.appendChild(make('div', 'atvp-hero__eyebrow', 'Сейчас в фокусе'));
        content.appendChild(make('div', 'atvp-hero__title'));
        content.appendChild(make('div', 'atvp-hero__meta'));
        content.appendChild(make('div', 'atvp-hero__overview'));
        hero.appendChild(image);
        hero.appendChild(content);
        root.appendChild(hero);
        root.classList.add('atvp-home');
        scroll.classList.add('atvp-main-scroll');
        state.root = root;
        state.scroll = scroll;
        state.hero = hero;
    }

    function cardData(card) {
        if (!card) return {};
        if (card.card_data) return card.card_data;
        if (window.jQuery) return window.jQuery(card).data('card') || {};
        return {};
    }

    function artwork(data, card) {
        try {
            if (data.backdrop_path && Lampa.Api && Lampa.Api.img) {
                return Lampa.Api.img(data.backdrop_path, 'w1280');
            }
            if (data.background_image) return data.background_image;
            if (Lampa.Utils && Lampa.Utils.cardImgBackground) {
                var background = Lampa.Utils.cardImgBackground(data);
                if (background) return background;
            }
        } catch (ignore) { /* The already-loaded poster is a safe fallback. */ }
        var image = card && card.querySelector('.card__img');
        var url = image && (image.currentSrc || image.src);
        return url && !/img_(?:load|broken)\./.test(url) ? url : '';
    }

    function updateHero(card) {
        if (!state.hero || !card || !state.root || !state.root.contains(card)) return;
        var data = cardData(card);
        var titleNode = card.querySelector('.card__title');
        var title = data.title || data.name || (titleNode && titleNode.textContent) || '';
        if (!title) return;
        var date = data.release_date || data.first_air_date || '';
        var meta = [];
        if (/^\d{4}/.test(date)) meta.push(date.slice(0, 4));
        var rating = Number(data.vote_average || 0);
        if (rating > 0 && isFinite(rating)) meta.push('Рейтинг ' + rating.toFixed(1));
        if (data.original_name || data.first_air_date || data.media_type === 'tv') meta.push('Сериал');
        else if (data.release_date || data.media_type === 'movie') meta.push('Фильм');
        var overview = String(data.overview || data.description || '').replace(/<[^>]*>/g, '').slice(0, 360);
        state.hero.querySelector('.atvp-hero__title').textContent = String(title);
        state.hero.querySelector('.atvp-hero__meta').textContent = meta.join('  ·  ');
        state.hero.querySelector('.atvp-hero__overview').textContent = overview;
        var url = artwork(data, card);
        if (url !== state.imageURL) {
            state.imageURL = url;
            var image = state.hero.querySelector('img');
            image.classList.add('atvp-image-wait');
            if (url) image.src = url;
            else image.removeAttribute('src');
        }
    }

    function queueFocus(card) {
        if (!card || !state.root || !state.root.contains(card)) return;
        state.pendingCard = card;
        window.clearTimeout(state.focusTimer);
        state.focusTimer = window.setTimeout(function () {
            updateHero(state.pendingCard);
            state.pendingCard = null;
        }, 90);
    }

    function refresh() {
        state.refreshTimer = 0;
        var root = activeHome();
        if (!root) {
            if (state.root) detachHome();
            return;
        }
        if (state.root && state.root !== root) detachHome();
        // Both current and legacy Main use a vertical .scroll outside each row.
        var scroll = root.querySelector('.activity__body .scroll');
        var firstCard = root.querySelector('.card[card_data], .card');
        if (!scroll || !firstCard) return;
        if (!state.hero) createHero(root, scroll);
        queueFocus(root.querySelector('.card.focus') || firstCard);
    }

    function scheduleRefresh() {
        if (!state.refreshTimer) state.refreshTimer = window.setTimeout(refresh, 150);
    }

    function focusEvent(event) {
        queueFocus(closest(event.target, '.card'));
    }

    function start() {
        if (!document.body) return;
        var style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        }
        document.body.classList.add('atvp-ui');
        document.addEventListener('hover:focus', focusEvent, true);
        document.addEventListener('focusin', focusEvent, true);
        if (window.jQuery) window.jQuery(document).on('hover:focus.atvp', '.card', focusEvent);
        if (window.MutationObserver) {
            state.observer = new MutationObserver(function (records) {
                var changed = false;
                records.forEach(function (record) {
                    if (closest(record.target, '[data-atvp-hero]')) return;
                    if (record.type === 'attributes') {
                        var target = record.target;
                        if (target.matches && target.matches('.card.focus')) queueFocus(target);
                        else if (target.matches && target.matches('.activity')) changed = true;
                    } else changed = true;
                });
                if (changed) scheduleRefresh();
            });
            state.observer.observe(document.body, {
                childList: true, subtree: true, attributes: true, attributeFilter: ['class']
            });
        }
        if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('activity', scheduleRefresh);
            Lampa.Listener.follow('app', scheduleRefresh);
        }
        scheduleRefresh();
        console.info('AppleTVPlusUI ready', VERSION);
    }

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
//# sourceURL=apple_tv_plus_ui.js
