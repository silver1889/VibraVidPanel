(function () {
    'use strict';
    if (window.VibraVidPanel) return;
    var script = document.getElementById('vibravid-panel-loader');
    if (!script) return;
    var scriptUrl = new URL(script.src, location.href);
    var rootPath = scriptUrl.pathname.split('/VibraVidPanel/assets/')[0];
    var rootUrl = scriptUrl.origin + rootPath;
    var settings = null, identity = '', updatedAt = 0, pending = null, generation = 0;
    var overlay = null, previousFocus = null, guiTicket = null, guiToken = null, detachViewport = null;
    var scheduledRender = null, refreshTimer = null;
    function apiClient() {
        var client = window.ApiClient;
        if (!client || typeof client.accessToken !== 'function' || typeof client.serverAddress !== 'function') return null;
        try { return new URL(client.serverAddress(), location.href).href.replace(/\/$/, '') === rootUrl.replace(/\/$/, '') && client.accessToken() ? client : null; }
        catch (_) { return null; }
    }
    function authHeaders(token) { return { Authorization: 'MediaBrowser Token="' + token + '"', Accept: 'application/json' }; }
    function removeMenuEntries() { document.querySelectorAll('[data-vibravid-menu]').forEach(function (node) { node.remove(); }); }
    function renderMenu() {
        scheduledRender = null;
        if (!settings || !settings.Enabled || !apiClient()) { removeMenuEntries(); return; }
        document.querySelectorAll('.mainDrawer .libraryMenuOptions').forEach(function (container) {
            var link = container.querySelector('[data-vibravid-menu]');
            if (!link) {
                link = document.createElement('a'); link.setAttribute('is', 'emby-linkbutton'); link.setAttribute('data-vibravid-menu', 'true');
                link.className = 'navMenuOption lnkMediaFolder'; link.setAttribute('data-itemid', 'vibravid-panel'); link.href = '#';
                var icon = document.createElement('span'); icon.className = 'material-icons navMenuOptionIcon download'; icon.setAttribute('aria-hidden', 'true');
                var label = document.createElement('span'); label.className = 'navMenuOptionText'; link.append(icon, label);
                link.addEventListener('click', function (event) {
                    event.preventDefault();
                    if (settings && settings.IsAdministrator) location.hash = '#/configurationpage?name=VibraVidDownloads';
                    else open();
                }); container.appendChild(link);
            }
            var label = link.querySelector('.navMenuOptionText');
            link.href = settings.IsAdministrator ? '#/configurationpage?name=VibraVidDownloads' : '#';
            if (label.textContent !== settings.MenuTitle) label.textContent = settings.MenuTitle;
        });
    }
    function scheduleRender() { if (scheduledRender === null) scheduledRender = setTimeout(renderMenu, 80); }
    function refresh(force) {
        var client = apiClient(), token = client ? client.accessToken() : '';
        if (token !== identity) { identity = token; settings = null; updatedAt = 0; generation++; pending = null; removeMenuEntries(); closePanel(); }
        if (!token) return Promise.resolve();
        if (pending) return pending;
        if (!force && Date.now() - updatedAt < 60000) return Promise.resolve();
        var ownGeneration = generation;
        pending = (async function () {
            try {
                var response = await fetch(rootUrl + '/VibraVidPanel/client', { headers: authHeaders(token), credentials: 'same-origin', cache: 'no-store' });
                var payload = response.ok ? await response.json() : null;
                if (ownGeneration !== generation) return;
                settings = payload; updatedAt = Date.now();
                if (!settings || !settings.Enabled) closePanel();
            } catch (_) { if (ownGeneration === generation) { settings = null; updatedAt = Date.now() - 45000; closePanel(); } }
            finally { if (ownGeneration === generation) { pending = null; scheduleRender(); } }
        }());
        return pending;
    }
    function addStyles() {
        if (document.getElementById('vibravid-panel-styles')) return;
        var style = document.createElement('style'); style.id = 'vibravid-panel-styles';
        style.textContent = [
            '#vibravid-panel{position:fixed;inset:0;z-index:99990;background:#101014;color:#f5f5f7;display:flex;flex-direction:column;font-family:inherit}',
            '#vibravid-panel *{box-sizing:border-box}',
            '#vibravid-panel .vp-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;background:#1a1a21;border-bottom:1px solid #34343e}',
            '#vibravid-panel .vp-title{font-size:1.1em;margin:0;flex:1 1 160px}',
            '#vibravid-panel .vp-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 14px;border:1px solid #555563;border-radius:8px;background:#282833;color:#fff;text-decoration:none;font:inherit;cursor:pointer}',
            '#vibravid-panel .vp-button:focus-visible{outline:3px solid #a970ff;outline-offset:3px}',
            '#vibravid-panel iframe{flex:1;width:100%;border:0;min-height:200px;background:#111}',
            '#vibravid-panel .vp-message{margin:0;padding:20px;line-height:1.6}',
            '#vibravid-panel.vp-keyboard .vp-title,#vibravid-panel.vp-keyboard .vp-toolbar .vp-button:not(:first-child){display:none}',
            '@media(max-width:600px){#vibravid-panel .vp-toolbar{padding:9px;gap:7px}#vibravid-panel .vp-title{order:-1;flex-basis:100%}#vibravid-panel .vp-button{font-size:.86em;padding:8px 10px}}'
        ].join('\n'); document.head.appendChild(style);
    }
    function button(text, action) {
        var node = document.createElement('button'); node.type = 'button'; node.className = 'vp-button'; node.textContent = text;
        node.addEventListener('click', action); return node;
    }
    function configure() { closePanel(); location.hash = '#/configurationpage?name=VibraVidPanel'; }
    function closePanel() {
        if (detachViewport) { detachViewport(); detachViewport = null; }
        if (guiTicket && guiToken) fetch(rootUrl + '/VibraVidPanel/session/' + guiTicket, { method: 'DELETE', headers: authHeaders(guiToken), keepalive: true }).catch(function () {});
        guiTicket = null; guiToken = null;
        if (overlay) { overlay.remove(); overlay = null; document.removeEventListener('keydown', panelKeys, true); }
        if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }
    function panelKeys(event) {
        if (!overlay) return;
        if (event.key === 'Escape') { event.preventDefault(); closePanel(); return; }
        if (event.key !== 'Tab') return;
        var nodes = Array.from(overlay.querySelectorAll('button,iframe'));
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
    }
    async function open() {
        await refresh(true);
        if (!settings || !settings.Enabled || !apiClient()) return;
        closePanel(); addStyles(); previousFocus = document.activeElement;
        var ownOverlay = document.createElement('section'); ownOverlay.id = 'vibravid-panel';
        ownOverlay.setAttribute('role', 'dialog'); ownOverlay.setAttribute('aria-modal', 'true'); ownOverlay.setAttribute('aria-labelledby', 'vibravid-panel-title'); overlay = ownOverlay;
        var toolbar = document.createElement('header'); toolbar.className = 'vp-toolbar';
        var back = button('← Jellyfin', closePanel);
        var title = document.createElement('h1'); title.id = 'vibravid-panel-title'; title.className = 'vp-title'; title.textContent = settings.MenuTitle;
        toolbar.append(back, title, button('Ricarica', open));
        if (settings.IsAdministrator) toolbar.appendChild(button('Impostazioni', configure));
        var message = document.createElement('p'); message.className = 'vp-message'; message.setAttribute('role', 'status');
        message.textContent = settings.Configured ? 'Connessione a VibraVid…' : settings.IsAdministrator ? 'Inserisci l’indirizzo interno del container nelle impostazioni del plugin.' : 'L’amministratore deve configurare l’indirizzo interno di VibraVid.';
        ownOverlay.append(toolbar, message); document.body.appendChild(ownOverlay); document.addEventListener('keydown', panelKeys, true); back.focus();
        if (!settings.Configured) return;
        var token = apiClient().accessToken();
        try {
            if (!window.VibraVidViewport) {
                if (!window.__VibraVidViewportLoading) window.__VibraVidViewportLoading = new Promise(function (resolve, reject) {
                    var script = document.createElement('script'); script.src = rootUrl + '/VibraVidPanel/assets/viewport.js?v=1.3.1.0';
                    script.onload = resolve; script.onerror = function () { window.__VibraVidViewportLoading = null; reject(new Error('Caricamento del pannello non riuscito.')); }; document.head.appendChild(script);
                });
                await window.__VibraVidViewportLoading;
                if (overlay !== ownOverlay) return;
            }
            var response = await fetch(rootUrl + '/VibraVidPanel/session', { method: 'POST', headers: authHeaders(token), cache: 'no-store' });
            if (!response.ok) throw new Error('Jellyfin non riesce ad aprire il pannello. Verifica le impostazioni del plugin.');
            var result = await response.json();
            if (overlay !== ownOverlay) { fetch(rootUrl + '/VibraVidPanel/session/' + result.Ticket, { method: 'DELETE', headers: authHeaders(token) }).catch(function () {}); return; }
            var url = new URL(result.Url, rootUrl);
            if (url.origin !== scriptUrl.origin || !url.pathname.startsWith(rootPath + '/VibraVidPanel/gui/')) throw new Error('Risposta del pannello non valida.');
            guiTicket = result.Ticket; guiToken = token;
            var frame = document.createElement('iframe'); frame.title = 'GUI VibraVid'; frame.referrerPolicy = 'no-referrer';
            frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads');
            frame.addEventListener('load', function () { message.remove(); }); frame.src = url.href; ownOverlay.appendChild(frame);
            detachViewport = window.VibraVidViewport.attach(frame, ownOverlay);
        } catch (error) { if (overlay === ownOverlay) message.textContent = error.message; }
    }
    window.VibraVidPanel = { version: '1.3.1.0', open: open, refresh: function () { return refresh(true); } };
    function start() {
        new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
        refreshTimer = setInterval(function () { refresh(false); }, 1500);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(true); });
        window.addEventListener('vibravid-settings-changed', function () { closePanel(); refresh(true); });
        window.addEventListener('pagehide', function (event) { if (event.target === window) clearInterval(refreshTimer); });
        window.addEventListener('pageshow', function (event) { if (event.persisted) { refreshTimer = setInterval(function () { refresh(false); }, 1500); refresh(true); } });
        refresh(true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}());
