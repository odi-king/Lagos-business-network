// LBN Phase 13C: a member sees the devices signed in to their account and can sign the others out. Works with supabase-security-3.sql.

(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function say(t, ok) { const m = el("sessMsg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }
    function when(t) { return new Date(t).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

    async function load() {
        const { data: sess } = await db.auth.getSession();
        if (!sess.session) { location.href = "auth.html?next=my-sessions.html"; return; }

        const { data, error } = await db.rpc("my_sessions");
        if (error) { el("sessList").innerHTML = "<p class='meta'>This is not set up yet. (The LBN team still needs to run supabase-security-3.sql.)</p>"; return; }

        el("sessList").innerHTML = (data || []).length ? data.map(function (s) {
            return '<div class="business-card" data-id="' + esc(s.id) + '"><strong>' + esc(s.device) + '</strong>' + (s.is_current ? " - THIS DEVICE" : "") +
                '<p class="meta">Area ' + esc(s.place) + ' - signed in ' + esc(when(s.created_at)) + ' - last used ' + esc(when(s.last_seen)) + '</p>' +
                (s.is_current ? "" : '<button type="button" class="btn btn-outline" data-out="1">Sign out this device</button>') + '</div>';
        }).join("") : "<p class='meta'>No devices to show.</p>";
    }

    el("sessList").addEventListener("click", async function (e) {
        const b = e.target.closest("[data-out]");
        if (!b) return;
        const r = await db.rpc("revoke_my_session", { p_id: b.closest("[data-id]").dataset.id });
        if (r.error) say(r.error.message, false); else { say("Device signed out.", true); load(); }
    });

    el("outAll").addEventListener("click", async function () {
        if (!confirm("Sign out every other device?")) return;
        const r = await db.rpc("revoke_my_other_sessions");
        if (r.error) say(r.error.message, false); else { say("Signed out " + r.data + " other device(s). A device may stay open for up to an hour until its pass expires.", true); load(); }
    });

    load();
})();