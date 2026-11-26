// LBN Phase 11E: the list of Representatives meetings you may join. Works with supabase-conference.sql.

(function () {
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

    async function load() {
        const { data: sess } = await db.auth.getSession();
        if (!sess.session) { location.href = "auth.html?next=conferences.html"; return; }

        const { data, error } = await db.rpc("my_conferences");
        const box = document.getElementById("confList");

        if (error) { box.innerHTML = "<p class='meta'>Meetings are not set up yet. (The LBN team still needs to run supabase-conference.sql.)</p>"; return; }

        box.innerHTML = (data || []).length ? data.map(function (c) {
            return '<div class="business-card"><strong>' + esc(c.title) + '</strong> - ' + (c.status === "live" ? "LIVE NOW" : "not started") +
                '<p class="meta">' + esc(new Date(c.starts_at).toLocaleString()) + ' - hosted by ' + esc(c.host_name) + (c.locked ? " - room locked" : "") + '</p>' +
                (c.status === "live" ? '<a class="contact-btn" href="conference.html?c=' + esc(c.id) + '">Join the meeting</a>' : '<p class="meta">You can join when the host starts it. You will get a notification.</p>') + '</div>';
        }).join("") : "<p class='meta'>No meetings for you right now.</p>";
    }

    load();
    setInterval(function () { if (!document.hidden) load(); }, 20000);
})();