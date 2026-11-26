// LBN Phase 13A: the Security Dashboard. Works with supabase-security.sql (Super Admin or the Security permission).

(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function say(t, ok) { const m = el("secMsg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }
    function when(t) { return new Date(t).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    function fail(e) { say(e.message === "Not allowed" ? "You do not have permission to open the Security Dashboard." : e.message, false); }

    const ICON = { ok: "OK", attention: "NEEDS ATTENTION", critical: "CRITICAL" };

    function showTab(n) {
        ["overview", "tables", "log", "payments"].forEach(function (t) { el("tab-" + t).style.display = t === n ? "" : "none"; });
        document.querySelectorAll(".sec-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === n); });
        if (n === "overview") loadOverview();
        if (n === "tables") loadTables();
        if (n === "log") loadLog();
        if (n === "payments") loadPayments();
    }

    el("secTabs").addEventListener("click", function (e) { const b = e.target.closest(".sec-tab"); if (b) showTab(b.dataset.tab); });
    el("secRun").addEventListener("click", loadOverview);
    el("logSev").addEventListener("change", loadLog);
    el("logOpen").addEventListener("change", loadLog);

    async function loadOverview() {
        const { data, error } = await db.rpc("admin_sec_overview");
        if (error) { fail(error); return; }
        say("", true);
        el("secStatus").innerHTML = '<h2>Overall status: ' + esc(ICON[data.status]) + '</h2><p class="meta">Checked ' + esc(when(data.checked_at)) + '. Worked out from real checks of your database.</p>';
        el("secChecks").innerHTML = data.checks.map(function (c) {
            return '<div class="business-card"><strong>' + esc(ICON[c.status]) + '</strong> - ' + esc(c.title) + ' (' + c.found + ')<p class="meta">' + esc(c.detail) + '</p></div>';
        }).join("");
    }

    async function loadTables() {
        const { data, error } = await db.rpc("admin_sec_tables");
        if (error) { fail(error); return; }
        el("secTables").innerHTML = data.map(function (t) {
            const bad = !t.rls && (t.anon_access || t.member_access);
            return '<div class="business-card"><strong>' + esc(t.table_name) + '</strong> - ' + (bad ? "OPEN AND UNPROTECTED" : t.rls ? "protected" : "no RLS, no direct access") +
                '<p class="meta">RLS ' + (t.rls ? "on" : "OFF") + ' - policies ' + t.policies + ' - logged-out access ' + (t.anon_access ? "YES" : "no") + ' - member direct access ' + (t.member_access ? "yes" : "no") + '</p></div>';
        }).join("");
    }

    async function loadLog() {
        const { data, error } = await db.rpc("admin_sec_log", { p_severity: el("logSev").value || null, p_only_open: el("logOpen").checked });
        if (error) { fail(error); return; }
        el("secLog").innerHTML = data.length ? data.map(function (l) {
            return '<div class="business-card" data-log="' + esc(l.id) + '"><strong>' + esc(l.severity.toUpperCase()) + '</strong> - ' + esc(l.message) +
                '<p class="meta">' + esc(when(l.created_at)) + (l.actor ? ' - ' + esc(l.actor) : '') + (l.details ? ' - ' + esc(l.details) : '') + '</p>' +
                (l.resolved ? '<p class="meta">Resolved: ' + esc(l.resolved_note) + '</p>' : (l.severity !== "info" ? '<div class="filters"><input type="text" class="rn" maxlength="300" placeholder="What was done?"><button type="button" class="btn btn-outline" data-resolve>Mark resolved</button></div>' : '')) + '</div>';
        }).join("") : "<p class='meta'>Nothing here.</p>";
    }

    el("secLog").addEventListener("click", async function (e) {
        const b = e.target.closest("[data-resolve]");
        if (!b) return;
        const c = b.closest("[data-log]");
        const r = await db.rpc("admin_sec_resolve", { p_id: c.dataset.log, p_note: c.querySelector(".rn").value });
        if (r.error) fail(r.error); else loadLog();
    });

    el("noteForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const r = await db.rpc("admin_sec_note", { p_severity: el("noteSev").value, p_message: el("noteText").value });
        if (r.error) fail(r.error); else { el("noteText").value = ""; loadLog(); }
    });

    async function loadPayments() {
        const { data, error } = await db.rpc("admin_sec_payments");
        if (error) { fail(error); return; }
        el("secPay").innerHTML = '<p>Membership payments (30 days): <strong>' + data.membership_payments_30d + '</strong> - coin purchases (30 days): <strong>' + data.coin_purchases_30d + '</strong> - payment alerts sent to admins (30 days): <strong>' + data.payment_alerts_30d + '</strong></p>' +
            '<p class="meta">Every payment is checked with Paystack, the amount must match the price, and each reference counts once. A payment that does not match is kept here instead of giving anyone access.</p>' +
            '<h3>Unmatched trade payments</h3>' + (data.unmatched.length ? data.unmatched.map(function (u) {
                return '<div class="business-card"><strong>' + esc(u.reference) + '</strong> - N' + Math.floor(Number(u.amount_kobo || 0) / 100).toLocaleString("en-NG") + '<p class="meta">' + esc(when(u.created_at)) + (u.note ? ' - ' + esc(u.note) : '') + '</p></div>';
            }).join("") : "<p class='meta'>None waiting.</p>");
    }

    showTab("overview");
})();