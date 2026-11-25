// LBN Phase 10A: the list of live streams and the Go live form. Works with supabase-streams.sql.

(function () {
    function el(id) { return document.getElementById(id); }

    function esc(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function say(box, text, ok) {
        box.textContent = text || "";
        box.className = "msg " + (ok ? "ok" : "error");
    }

    let busy = false;
    let lastSig = "";

    async function load() {
        if (busy) return;
        busy = true;

        try {
            const { data, error } = await db.rpc("live_streams");

            if (error) {
                el("streamList").innerHTML = "<p class='meta'>Live streams are not set up yet. (The LBN team still needs to run supabase-streams.sql.)</p>";
                return;
            }

            const sig = JSON.stringify(data);
            if (sig === lastSig) return;
            lastSig = sig;

            el("streamList").innerHTML = (data || []).map(function (s) {
                return '<div class="business-card stream-card"><div><h3><span class="live-dot">LIVE</span>' + esc(s.title) + "</h3>" +
                    '<p class="meta">' + esc(s.host_name) + " • " + Number(s.viewers) + " watching</p></div><div>" +
                    (s.mine ? "" : '<button type="button" class="btn btn-outline" data-follow="' + esc(s.host_id) + '">' + (s.i_follow ? "Following" : "Follow") + "</button> ") +
                    '<a class="contact-btn" href="stream.html?s=' + esc(s.id) + '">' + (s.mine ? "Open my stream" : "Watch") + "</a></div></div>";
            }).join("") || "<p class='meta'>Nobody is live right now.</p>";
        } finally {
            busy = false;
        }
    }

    el("streamList").addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-follow]");
        if (!b) return;
        b.disabled = true;
        const { data, error } = await db.rpc("toggle_follow", { p_target: b.dataset.follow });
        if (error) { say(el("listMsg"), error.message, false); b.disabled = false; return; }
        b.textContent = data ? "Following" : "Follow";
        b.disabled = false;
        lastSig = "";
    });

    el("goForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        el("goBtn").disabled = true;
        say(el("goMsg"), "Starting...", true);

        const { data, error } = await db.rpc("stream_start", { p_title: el("goTitle").value });

        if (error) {
            say(el("goMsg"), error.message, false);
            el("goBtn").disabled = false;
            return;
        }

        location.href = "stream.html?s=" + encodeURIComponent(data);
    });

    async function start() {
        if (!db) { el("streamList").innerHTML = "<p class='meta'>Supabase is not connected yet.</p>"; return; }

        const { data } = await db.auth.getSession();
        if (!data.session) { location.href = "auth.html?next=" + encodeURIComponent("streams.html"); return; }

        el("goPanel").style.display = "";
        load();
        setInterval(function () { if (!document.hidden) load(); }, 8000);
    }

    start();
})();