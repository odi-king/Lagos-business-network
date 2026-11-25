// LBN Phase 10A: the admin's "Live streams" panel (Support permission). Works with supabase-streams.sql.
// Uses escapeHTML and db from admin.js.

(function () {
    const list = document.getElementById("streamAdminList");
    const filter = document.getElementById("streamAdminFilter");
    const msg = document.getElementById("streamAdminMsg");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    function say(text, ok) { msg.textContent = text || ""; msg.className = "msg " + (ok ? "ok" : "error"); }

    async function load() {
        const { data, error } = await db.rpc("admin_streams", { p_status: filter.value });

        if (error) { list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-streams.sql in Supabase.</p>"; return; }

        list.innerHTML = (data || []).map(function (s) {
            const id = escapeHTML(s.id);
            return '<div class="business-card"><h3>' + escapeHTML(s.title) + "</h3>" +
                '<p class="meta">By ' + escapeHTML(s.host_name) + " • " + escapeHTML(s.status) + " • " + Number(s.viewers) + " watching now • peak " + Number(s.peak_viewers) +
                (s.reports ? ' • <strong style="color:#c0392b;">' + s.reports + " report(s)</strong>" : "") + (s.banned ? " • banned from streaming" : "") + "</p>" +
                '<p class="meta">' + escapeHTML(new Date(s.started_at).toLocaleString()) + "</p>" +
                (s.status === "live" ? '<a class="btn btn-outline" href="stream.html?s=' + id + '" target="_blank" rel="noopener">Watch</a> ' +
                    '<button type="button" class="delete-btn" data-end="' + id + '">End this stream</button> ' : "") +
                (s.reports ? '<button type="button" class="btn btn-outline" data-reports="' + id + '">Read reports</button> ' : "") +
                (s.banned ? '<button type="button" class="btn btn-outline" data-unban="' + escapeHTML(s.host_id) + '">Allow streaming again</button>'
                          : '<button type="button" class="delete-btn" data-ban="' + escapeHTML(s.host_id) + '">Ban from streaming</button>') +
                '<div data-box></div></div>';
        }).join("") || "<p class='meta'>No streams here.</p>";
    }

    async function run(rpc, args, done) {
        const { error } = await db.rpc(rpc, args);
        say(error ? error.message : done, !error);
        load();
    }

    list.addEventListener("click", async function (event) {
        const b = event.target.closest("button");
        if (!b) return;

        if (b.dataset.end) {
            const reason = prompt("Reason (the streamer will be told):", "Breaking the LBN rules");
            if (reason !== null) run("admin_stream_end", { p_stream: b.dataset.end, p_reason: reason }, "The stream was ended.");
        } else if (b.dataset.ban) {
            const reason = prompt("Reason for the ban (the member will be told, 5 characters or more):");
            if (reason) run("admin_stream_ban", { p_user: b.dataset.ban, p_reason: reason }, "The member can no longer go live.");
        } else if (b.dataset.unban) {
            run("admin_stream_unban", { p_user: b.dataset.unban }, "The member can stream again.");
        } else if (b.dataset.reports) {
            const box = b.closest(".business-card").querySelector("[data-box]");
            const { data, error } = await db.rpc("admin_stream_reports", { p_stream: b.dataset.reports });
            box.innerHTML = error ? "<p class='msg error'>" + escapeHTML(error.message) + "</p>" : (data || []).map(function (r) {
                return '<p class="meta">' + escapeHTML(r.reporter) + ": " + escapeHTML(r.reason) + "</p>";
            }).join("");
        }
    });

    const maxBox = document.getElementById("streamMaxGuests");

    async function loadMax() {
        if (!maxBox) return;
        const { data } = await db.rpc("admin_stream_settings");
        if (data) maxBox.value = data.max_guests;
    }

    const maxSave = document.getElementById("streamMaxSave");
    if (maxSave) {
        maxSave.addEventListener("click", function () {
            run("admin_set_stream_max_guests", { p_max: parseInt(maxBox.value, 10) }, "Saved. This is the most guests a streamer can have on stage.");
        });
    }

    filter.addEventListener("change", load);
    loadMax();
    load();
    setInterval(function () { if (!document.hidden && filter.value === "live") load(); }, 20000);
})();