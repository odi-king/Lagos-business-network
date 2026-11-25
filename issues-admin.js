// LBN Phase 9F: the admin's "Delivery problems" panel (Finance permission). Works with supabase-delivery-issues.sql.
// Uses escapeHTML and db from admin.js.

(function () {
    const list = document.getElementById("issueList");
    const filter = document.getElementById("issueFilter");
    const msg = document.getElementById("issueMsg");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    async function load() {
        const { data, error } = await db.rpc("admin_delivery_issues", { p_status: filter.value });

        if (error) { list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-delivery-issues.sql in Supabase.</p>"; return; }

        list.innerHTML = (data || []).map(function (i) {
            const action = i.status === "open"
                ? '<div class="filters"><input type="text" maxlength="500" data-note placeholder="What you decided (everyone on the trade is told)">' +
                  '<button type="button" class="contact-btn" data-resolve="' + escapeHTML(i.id) + '">Close this report</button></div>'
                : '<p class="meta">Decision: ' + escapeHTML(i.admin_note || "") + "</p>";

            return '<div class="business-card"><h3>' + escapeHTML(i.item) + "</h3>" +
                '<p class="meta"><strong>' + escapeHTML(i.kind) + "</strong> • reported by the " + (i.role === "rider" ? "rider " : "") + escapeHTML(i.reporter_name) + "</p>" +
                '<p class="meta">' + escapeHTML(i.body) + "</p>" +
                '<p class="meta"><a href="trade.html?id=' + escapeHTML(i.trade_id) + '">Open the trade</a> • ' + escapeHTML(new Date(i.created_at).toLocaleString()) + "</p>" + action + "</div>";
        }).join("") || "<p class='meta'>Nothing here.</p>";
    }

    list.addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-resolve]");
        if (!b) return;

        b.disabled = true;
        const note = b.closest(".business-card").querySelector("[data-note]").value;
        const { error } = await db.rpc("admin_resolve_delivery_issue", { p_id: b.dataset.resolve, p_note: note });
        msg.textContent = error ? error.message : "Closed. Everyone on the trade was told.";
        msg.className = "msg " + (error ? "error" : "ok");
        load();
    });

    filter.addEventListener("change", load);
    load();
})();