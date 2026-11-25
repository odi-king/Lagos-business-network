// LBN Phase 9E: the admin's rider performance and emergency alerts (Finance permission). Works with supabase-rider-quality.sql.
// Uses escapeHTML and db from admin.js.

(function () {
    const alerts = document.getElementById("riderAlerts");
    const stats = document.getElementById("riderStats");
    if (!alerts || !stats || typeof db === "undefined" || !db) return;

    async function loadAlerts() {
        const { data, error } = await db.rpc("admin_rider_alerts", { p_status: "open" });

        if (error) { alerts.innerHTML = "<p class='meta'>Not set up yet. Run supabase-rider-quality.sql in Supabase.</p>"; return; }

        alerts.innerHTML = (data || []).map(function (a) {
            return '<div class="business-card"><p class="msg error"><strong>EMERGENCY:</strong> ' + escapeHTML(a.legal_name) + " • " + escapeHTML(a.phone || "") + "</p>" +
                (a.note ? '<p class="meta">' + escapeHTML(a.note) + "</p>" : "") +
                '<p class="meta">' + escapeHTML(new Date(a.created_at).toLocaleString()) + "</p>" +
                '<button type="button" class="contact-btn" data-handled="' + escapeHTML(a.id) + '">I have dealt with this</button></div>';
        }).join("") || "<p class='meta'>No open emergency alerts.</p>";
    }

    async function loadStats() {
        const { data, error } = await db.rpc("admin_rider_stats");
        if (error) { stats.innerHTML = ""; return; }

        stats.innerHTML = (data || []).map(function (r) {
            return '<div class="business-card"><h3>' + escapeHTML(r.legal_name) + " (" + escapeHTML(r.status) + ")</h3>" +
                '<p class="meta">' + Number(r.delivered) + " deliveries • " +
                (r.average === null ? "no ratings yet" : r.average + " out of 5 from " + r.ratings + " ratings") +
                (r.low_ratings ? ' • <strong>' + r.low_ratings + " low (1 or 2 stars)</strong>" : "") + "</p>" +
                (r.ratings ? '<button type="button" class="btn btn-outline" data-comments="' + escapeHTML(r.user_id) + '">Read comments</button><div data-box></div>' : "") + "</div>";
        }).join("") || "<p class='meta'>No approved riders yet.</p>";
    }

    alerts.addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-handled]");
        if (!b) return;
        b.disabled = true;
        await db.rpc("admin_rider_alert_handled", { p_id: b.dataset.handled });
        loadAlerts();
    });

    stats.addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-comments]");
        if (!b) return;
        const box = b.parentNode.querySelector("[data-box]");
        const { data, error } = await db.rpc("admin_rider_comments", { p_user: b.dataset.comments });
        box.innerHTML = error ? "<p class='msg error'>" + escapeHTML(error.message) + "</p>" : (data || []).map(function (c) {
            return '<p class="meta">' + c.stars + " stars" + (c.comment ? ": " + escapeHTML(c.comment) : "") + " • " + escapeHTML(new Date(c.created_at).toLocaleDateString()) + "</p>";
        }).join("");
    });

    loadAlerts();
    loadStats();
    setInterval(function () { if (!document.hidden) loadAlerts(); }, 15000);
})();