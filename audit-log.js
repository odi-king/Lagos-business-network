// LBN Phase 14B: the central Admin Activity Audit Log. Works with supabase-audit.sql.
(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function when(t) { return new Date(t).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    let rows = [];

    async function load() {
        const s = await db.auth.getSession();
        if (!s.data.session) { location.href = "auth.html?next=audit-log.html"; return; }

        const { data, error } = await db.rpc("admin_activity", { p_days: parseInt(el("auDays").value, 10), p_q: el("auQ").value, p_limit: 500 });
        if (error) {
            el("auList").innerHTML = "<p class='msg error'>" + esc(error.message === "Not allowed" ? "You do not have permission to open the audit log." : error.message.indexOf("admin_activity") !== -1 ? "The audit log is not set up yet. (The LBN team still needs to run supabase-audit.sql.)" : error.message) + "</p>";
            return;
        }
        rows = data || [];
        el("auList").innerHTML = rows.length ? rows.map(function (r) {
            return '<div class="business-card"><strong>' + esc(r.action) + '</strong> - ' + esc(r.actor) + (r.role && r.role !== "-" ? " (" + esc(r.role) + ")" : "") + (r.target ? " - on " + esc(r.target) : "") +
                '<p class="meta">' + esc(when(r.at)) + (r.details ? " - " + esc(r.details) : "") + (r.ip ? " - from " + esc(r.ip) : "") + (r.device ? " - " + esc(r.device) : "") + " - " + esc(r.source) + '</p></div>';
        }).join("") : "<p class='meta'>Nothing found.</p>";
    }

    el("auGo").addEventListener("click", load);
    el("auDays").addEventListener("change", load);
    el("auQ").addEventListener("keydown", function (e) { if (e.key === "Enter") load(); });

    el("auCsv").addEventListener("click", function () {
        if (!rows.length) return;
        const q = function (v) { return '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"'; };
        const out = [["time", "administrator", "role", "action", "affected", "details", "ip", "device", "source"]];
        rows.forEach(function (r) { out.push([r.at, r.actor, r.role, r.action, r.target, r.details, r.ip, r.device, r.source]); });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([out.map(function (r) { return r.map(q).join(","); }).join("\n")], { type: "text/csv" }));
        a.download = "lbn-admin-audit-log.csv";
        a.click();
    });

    load();
})();