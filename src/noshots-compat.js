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
