// LBN Phase 13H: cookie and browser-storage notice, plus the consent switch for any FUTURE optional tools.
// Today LBN uses only essential storage (login, language, settings, offline use) and the Cloudflare security check, so
// nothing optional is switched on. If an optional tool (for example website statistics) is ever added, it MUST ask
// window.lbnConsent.allowed("analytics") first. That answer stays false until the visitor says yes on the Cookie page.
(function () {
    const KEY = "lbn_cookie_choice";

    function read() {
        try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
    }

    window.lbnConsent = {
        allowed: function (kind) {
            const c = read();
            return !!(c && c.optional === true && kind);
        },
        set: function (optional) {
            try { localStorage.setItem(KEY, JSON.stringify({ optional: !!optional, at: new Date().toISOString() })); } catch (e) { /* ignore */ }
        },
        current: function () { const c = read(); return c ? c.optional === true : false; },
        decided: function () { return !!read(); }
    };

    if (window.lbnConsent.decided()) return;
    if (/cookies\.html$/.test(location.pathname)) return;

    window.addEventListener("load", function () {
        if (document.getElementById("lbnCookieBar")) return;
        const bar = document.createElement("div");
        bar.id = "lbnCookieBar";
        bar.setAttribute("role", "region");
        bar.setAttribute("aria-label", "Cookie notice");
        bar.style.cssText = "position:fixed;left:10px;right:10px;bottom:84px;z-index:9999;max-width:560px;margin:0 auto;background:#0f1a2e;color:#e8eefc;border:1px solid #2a3a5c;border-radius:12px;padding:12px 14px;font-size:.88rem;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.45);";
        bar.innerHTML = 'We only use the browser storage LBN needs to work: staying logged in, your language and a security check. We do not use advertising or tracking cookies. <a href="cookies.html" style="color:#2fd6a1;">Cookie Policy</a>' +
            '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;"><button type="button" id="lbnCookieOk" style="background:#2fd6a1;color:#062;border:0;border-radius:8px;padding:7px 14px;font-weight:700;">OK</button></div>';
        document.body.appendChild(bar);
        document.getElementById("lbnCookieOk").addEventListener("click", function () {
            window.lbnConsent.set(false); // essential only
            bar.remove();
        });
    });
})();
