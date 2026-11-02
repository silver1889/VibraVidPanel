(function () {
    'use strict';
    // Native confirm() is unavailable in the opaque GUI frame. Handle the two
    // 1.4.9 bulk controls before their native click handlers, then resume the
    // normal submit event so the GUI still applies quality, audio and CSRF.
    var approved = new WeakSet(), active = null;
    function kind(form) {
        var field = form && form.querySelector('input[name="download_type"]');
        return field && field.value;
    }
    function title(form) {
        try {
            var payload = JSON.parse(form.querySelector('[name="item_payload"]').value);
            return String(payload.name || 'questa serie').slice(0, 300);
        } catch (_) { return 'questa serie'; }
    }
    function resume(form, submitter) {
        if (!form.isConnected) return;
        approved.add(form);
        try {
            if (submitter && submitter.form === form && !submitter.disabled) form.requestSubmit(submitter);
            else form.requestSubmit();
        } finally {
            // Validation can prevent submit from firing. Never retain approval
            // for a later, unrelated click on a form that stayed on the page.
            approved.delete(form);
        }
    }
    function confirmBatch(form, submitter, seasons) {
        if (active || !form || !form.isConnected || form.dataset.qualityPending) return;
        if (!document.getElementById('vp-bulk-style')) {
            var style = document.createElement('style'); style.id = 'vp-bulk-style';
            style.textContent = '.vp-bulk-dialog{box-sizing:border-box;width:calc(100% - 32px);max-width:440px;max-height:90vh;overflow:auto;margin:auto;padding:24px;border:1px solid #555;border-radius:12px;background:#202026;color:#fff;box-shadow:0 12px 50px #0009;font:16px/1.5 system-ui,sans-serif;color-scheme:dark}.vp-bulk-dialog::backdrop{background:#000b}.vp-bulk-dialog h2{font:600 22px/1.3 system-ui;margin:0 0 16px}.vp-bulk-dialog p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 22px}.vp-bulk-actions{display:flex;justify-content:flex-end;gap:12px;flex-wrap:wrap}.vp-bulk-actions button{border:1px solid #777;border-radius:6px;padding:12px 16px;background:#333;color:#fff;font:600 16px system-ui;cursor:pointer}.vp-bulk-actions button:last-child{background:#197bad;border-color:#197bad}.vp-bulk-actions button:focus-visible{outline:3px solid #fff;outline-offset:3px}.vp-bulk-fallback{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#000b}';
            document.head.appendChild(style);
        }
        var dialog = document.createElement('dialog'); dialog.className = 'vp-bulk-dialog';
        dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'vp-bulk-heading'); dialog.setAttribute('aria-describedby', 'vp-bulk-message');
        var heading = document.createElement('h2'); heading.id = 'vp-bulk-heading'; heading.textContent = 'Conferma download';
        var message = document.createElement('p'); message.id = 'vp-bulk-message';
        message.textContent = seasons ? 'Vuoi scaricare le stagioni ' + seasons.join(', ') + ' di “' + title(form) + '”?' :
            'Vuoi scaricare tutte le stagioni di “' + title(form) + '”?';
        var actions = document.createElement('div'); actions.className = 'vp-bulk-actions';
        var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Annulla'; cancel.autofocus = true;
        var accept = document.createElement('button'); accept.type = 'button';
        accept.textContent = seasons ? 'Scarica stagioni selezionate' : 'Scarica tutte le stagioni';
        actions.appendChild(cancel); actions.appendChild(accept);
        dialog.appendChild(heading); dialog.appendChild(message); dialog.appendChild(actions);
        var previous = document.activeElement, closed = false, overlay = null;
        active = dialog; document.body.appendChild(dialog);
        function finish(accepted) {
            if (closed) return;
            closed = true; accept.disabled = true; cancel.disabled = true; active = null;
            if (dialog.open && typeof dialog.close === 'function') dialog.close();
            dialog.remove(); if (overlay) overlay.remove();
            if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
            if (!accepted || !form.isConnected) return;
            if (seasons) {
                var field = form.querySelector('[name="selected_seasons"]');
                if (!field) return;
                field.value = seasons.join(',');
            }
            resume(form, submitter);
        }
        cancel.addEventListener('click', function () { finish(false); });
        accept.addEventListener('click', function () { finish(true); });
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); finish(false); });
        dialog.addEventListener('close', function () { finish(false); });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') { event.preventDefault(); finish(false); }
            else if (event.key === 'Tab') {
                event.preventDefault(); (document.activeElement === cancel ? accept : cancel).focus();
            }
        });
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else {
            overlay = document.createElement('div'); overlay.className = 'vp-bulk-fallback';
            document.body.appendChild(overlay); overlay.appendChild(dialog); dialog.setAttribute('open', '');
        }
        cancel.focus();
    }
    document.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('#cn-all, #cn-seasons-btn');
        if (!button || button.disabled) return;
        var form, seasons = null;
        if (button.id === 'cn-all') {
            form = button.form;
            if (kind(form) !== 'full_series') return;
        } else {
            form = document.getElementById('cn-seasons-form');
            if (kind(form) !== 'selected_seasons') return;
            seasons = Array.prototype.map.call(document.querySelectorAll('.cn-season-pick:checked:not(:disabled)'), function (field) { return field.value; });
        }
        event.preventDefault(); event.stopImmediatePropagation();
        if (seasons && !seasons.length) return;
        confirmBatch(form, button.form === form ? button : null, seasons);
    }, true);
    document.addEventListener('submit', function (event) {
        var form = event.target, type = kind(form);
        if (type !== 'full_series' && type !== 'selected_seasons') return;
        if (approved.has(form)) { approved.delete(form); return; }
        event.preventDefault(); event.stopImmediatePropagation();
        var selected = form.querySelector('[name="selected_seasons"]');
        var seasons = type === 'selected_seasons' ? String(selected && selected.value || '').split(',').map(function (value) { return value.trim(); }).filter(Boolean) : null;
        if (seasons && !seasons.length) return;
        confirmBatch(form, event.submitter, seasons);
    }, true);
}());
