(function () {
    'use strict';
    var prefix = __VP_PREFIX__;
    var visibleCookies = __VP_COOKIE__;
    var origin = location.origin;
    // The iframe has an opaque origin. These preferences belong only to VibraVid;
    // the original GUI cannot read Jellyfin's localStorage, cookies or parent DOM.
    function storage(name) {
        var values = {};
        try { values = JSON.parse(window.name || '{}')[name] || {}; } catch (_) { }
        function persist() {
            var all = {};
            try { all = JSON.parse(window.name || '{}'); } catch (_) { }
            all[name] = values; window.name = JSON.stringify(all);
        }
        return {
            getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
            setItem: function (key, value) { values[key] = String(value); persist(); },
            removeItem: function (key) { delete values[key]; persist(); },
            clear: function () { values = {}; persist(); },
            key: function (index) { return Object.keys(values)[index] || null; },
            get length() { return Object.keys(values).length; }
        };
    }
    Object.defineProperty(window, 'localStorage', { value: storage('localStorage'), configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: storage('sessionStorage'), configurable: true });
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true,
        get: function () { return visibleCookies; },
        set: function (value) { visibleCookies += '; ' + String(value).split(';')[0]; }
    });
    function mapped(value) {
        var url = new URL(String(value), location.href);
        if (url.origin === origin && url.pathname.indexOf(prefix) === 0) return url.href;
        if (url.origin === origin && /^\/(?:$|(?:api|static|search|downloads?|watchlist|settings|logs|schedule|admin|arr-stack|series-detail|series-metadata|login|logout|cinema)(?:[/?#]|$))/.test(url.pathname))
            return origin + prefix + url.pathname.replace(/^\//, '') + url.search + url.hash;
        throw new TypeError('Indirizzo esterno al pannello non consentito.');
    }
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, options) {
        options = Object.assign({}, options || {}, { credentials: 'omit' });
        if (input instanceof Request) return originalFetch(new Request(mapped(input.url), input), options);
        return originalFetch(mapped(input), options);
    };
    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        var args = Array.prototype.slice.call(arguments); args[1] = mapped(url);
        return originalOpen.apply(this, args);
    };
    document.addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link || link.getAttribute('href').indexOf('#') === 0) return;
        try { link.href = mapped(link.href); link.target = '_self'; }
        catch (_) { event.preventDefault(); }
    }, true);
    document.addEventListener('submit', function (event) {
        try { event.target.action = mapped(event.target.action); event.target.target = '_self'; }
        catch (_) { event.preventDefault(); }
    }, true);
    function editable(element) {
        return element && (element.isContentEditable || element.tagName === 'TEXTAREA' ||
            element.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|file|hidden|color)$/i.test(element.type));
    }
    var pressing = false, releaseTimer = 0, pressGuard = 0;
    function revealFocus() {
        if (pressing) return;
        if (innerWidth > 640 || !editable(document.activeElement)) return;
        window.scrollBy(0, document.activeElement.getBoundingClientRect().top - 18);
    }
    function notifyFocus() {
        if (pressing) return;
        var active = !!editable(document.activeElement);
        document.documentElement.classList.toggle('vp-editing', active && innerWidth <= 640);
        parent.postMessage({ type: 'vibravid-editing', active: active }, '*');
        if (active) { requestAnimationFrame(revealFocus); setTimeout(revealFocus, 250); setTimeout(revealFocus, 600); }
    }
    document.addEventListener('focusin', notifyFocus);
    document.addEventListener('focusout', function () { setTimeout(notifyFocus, 0); });
    document.addEventListener('DOMContentLoaded', notifyFocus);
    window.addEventListener('resize', notifyFocus);
    document.addEventListener('pointerdown', function () {
        clearTimeout(releaseTimer); clearTimeout(pressGuard); pressing = true;
        parent.postMessage({ type: 'vibravid-press', active: true }, '*');
        pressGuard = setTimeout(releasePress, 2000);
    }, true);
    function releasePress() {
        clearTimeout(pressGuard);
        parent.postMessage({ type: 'vibravid-press', active: false }, '*');
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(function () { pressing = false; notifyFocus(); }, 160);
    }
    document.addEventListener('pointerup', releasePress, true);
    document.addEventListener('pointercancel', releasePress, true);
    window.addEventListener('message', function (event) {
        var data = event.data;
        if (event.source !== parent || !data || data.type !== 'vibravid-viewport') return;
        if (pressing) return;
        document.documentElement.classList.toggle('vp-keyboard', data.keyboard === true);
        if (!editable(document.activeElement) || !Number.isFinite(data.top) || !Number.isFinite(data.bottom)) return;
        var top = Math.max(0, Math.min(innerHeight, data.top)), bottom = Math.max(top + 40, Math.min(innerHeight, data.bottom));
        var rect = document.activeElement.getBoundingClientRect();
        if (rect.bottom > bottom) window.scrollBy(0, rect.bottom - bottom);
        else if (rect.top < top) window.scrollBy(0, rect.top - top);
    });
}());
