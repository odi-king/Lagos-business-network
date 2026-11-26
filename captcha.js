// LBN Phase 13G: Cloudflare Turnstile CAPTCHA on the login, sign-up, forgot-password and change-password forms.
// It stays OFF until you paste your Turnstile SITE key below (the site key is public and safe on GitHub).
// The SECRET key never goes in a file: it is pasted in Supabase (Authentication > Attack Protection).
window.LBN_TURNSTILE_SITEKEY = "";

window.lbnCaptcha = function (containerId) {
    const key = window.LBN_TURNSTILE_SITEKEY;
    const box = document.getElementById(containerId);
    let token = "";
    let widget = null;

    if (!key || !box) return { enabled: false, token: function () { return undefined; }, reset: function () {} };

    function draw() {
        if (!window.turnstile) { setTimeout(draw, 200); return; }
        widget = window.turnstile.render(box, {
            sitekey: key,
            theme: "dark",
            callback: function (t) { token = t; },
            "expired-callback": function () { token = ""; },
            "error-callback": function () { token = ""; }
        });
    }

    if (!document.getElementById("lbnTurnstileScript")) {
        const s = document.createElement("script");
        s.id = "lbnTurnstileScript";
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
    }
    draw();

    return {
        enabled: true,
        token: function () {
            if (!token) throw new Error("Please wait for the security check to finish, then try again.");
            return token;
        },
        reset: function () {
            token = "";
            try { if (window.turnstile && widget !== null) window.turnstile.reset(widget); } catch (e) { /* ignore */ }
        }
    };
};