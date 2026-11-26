// LBN Phase 13A: the Security Dashboard. Works with supabase-security.sql (Super Admin or the Security permission).

(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function say(t, ok) { const m = el("secMsg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }
    function when(t) { return new Date(t).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    function fail(e) { say(e.message === "Not allowed" ? "You do not have permission to open the Security Dashboard." : e.message, false); }

    const ICON = { ok: "OK", attention: "NEEDS ATTENTION", critical: "CRITICAL" };

    function showTab(n) {
        ["overview", "tables", "log", "payments", "logins", "ips", "lock", "legal", "files", "secrets", "accounts", "report"].forEach(function (t) { el("tab-" + t).style.display = t === n ? "" : "none"; });
        document.querySelectorAll(".sec-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === n); });
        if (n === "overview") loadOverview();
        if (n === "tables") loadTables();
        if (n === "log") loadLog();
        if (n === "payments") loadPayments();
        if (n === "logins") loadLogins();
        if (n === "ips") loadIps();
        if (n === "lock") loadLock();
        if (n === "legal") loadLegal();
        if (n === "files") loadFiles();
        if (n === "accounts") loadSuspended();
        if (n === "report") loadReport();
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

    // ----- 13.3 and 13.5: logins and threats -----
    async function loadLogins() {
        const { data, error } = await db.rpc("admin_sec_logins");
        if (error) { fail(error); return; }
        el("secLogins").innerHTML = '<p>Successful logins (24 hours): <strong>' + (data.successful_24h === null ? "not available" : data.successful_24h) + '</strong> - failed on the LBN login page: <strong>' + data.failed_24h + '</strong> (24 hours), ' + data.failed_7d + ' (7 days)</p>' +
            '<h3>Accounts targeted by wrong passwords (24 hours)</h3>' + (data.targets.length ? data.targets.map(function (t) { return '<p class="meta">' + esc(t.who) + ' - ' + t.failed + ' failed - last ' + esc(when(t.last)) + '</p>'; }).join("") : "<p class='meta'>None.</p>") +
            '<h3>Accounts signed in from 3 or more places (24 hours)</h3>' + (data.many_places.length ? data.many_places.map(function (t) { return '<p class="meta">' + esc(t.user) + ' - ' + t.places + ' places, ' + t.sessions + ' sessions</p>'; }).join("") : "<p class='meta'>None.</p>") +
            '<p class="meta">Supabase does not report wrong passwords that do not come through our own login page.</p>';
    }

    el("scanBtn").addEventListener("click", async function () {
        const { data, error } = await db.rpc("admin_sec_scan");
        if (error) { fail(error); return; }
        el("secScan").innerHTML = data.findings.length ? data.findings.map(function (f) { return '<div class="business-card"><strong>' + esc(f.severity.toUpperCase()) + '</strong> - ' + esc(f.rule) + '<p class="meta">' + esc(f.detail) + '</p></div>'; }).join("") : "<p class='meta'>No threats found by the rules.</p>";
    });

    // ----- 13C: IP bans -----
    async function loadIps() {
        const { data, error } = await db.rpc("admin_sec_ips");
        if (error) { fail(error); return; }
        el("secIps").innerHTML = (data || []).length ? data.map(function (b) {
            const label = b.status === "suggested" ? "NEEDS YOUR REVIEW" : b.status === "banned" ? "BANNED " + (b.expires_at ? "until " + when(b.expires_at) : "permanently") : b.status;
            let buttons = "";
            if (b.status === "suggested") buttons = '<button type="button" class="btn btn-outline" data-ip="ban_24h">Ban 24 hours</button><button type="button" class="btn btn-outline" data-ip="ban_7d">Ban 7 days</button><button type="button" class="btn btn-outline" data-ip="ban_permanent">Ban permanently</button><button type="button" class="btn btn-outline" data-ip="dismiss">Not an attack</button>';
            if (b.status === "banned") buttons = '<button type="button" class="btn btn-outline" data-ip="lift">Lift the ban</button>';
            return '<div class="business-card" data-id="' + esc(b.id) + '"><strong>' + esc(label) + '</strong><p class="meta">' + esc(b.reason || "") + ' - last 24 hours: ' + b.fails_24h + ' failed logins on ' + b.accounts_24h + ' account(s) - first seen ' + esc(when(b.created_at)) + '</p>' +
                (buttons ? '<div class="filters"><input type="text" class="why" maxlength="300" placeholder="Reason (required)">' + buttons + '</div>' : "") + '</div>';
        }).join("") : "<p class='meta'>Nothing to review.</p>";
    }

    el("secIps").addEventListener("click", async function (e) {
        const b = e.target.closest("[data-ip]");
        if (!b) return;
        const c = b.closest("[data-id]");
        const r = await db.rpc("admin_sec_ip_decide", { p_id: c.dataset.id, p_action: b.dataset.ip, p_reason: c.querySelector(".why").value });
        if (r.error) fail(r.error); else { say("Done.", true); loadIps(); }
    });

    // ----- 13D: admin route lock -----
    async function loadLock() {
        const m = await db.rpc("admin_sec_mfa");
        if (m.error) { fail(m.error); return; }
        const r = await db.rpc("admin_sec_routes");
        const rows = r.data || [];
        const bad = rows.filter(function (x) { return !x.guarded || x.logged_out_can_run; });
        const without = m.data.admins.filter(function (a) { return !a.two_step; });

        el("secLock").innerHTML =
            '<p>Two-step login is <strong>' + (m.data.required ? "REQUIRED for every admin" : "NOT required yet") + '</strong>. Admins without it: <strong>' + without.length + '</strong> of ' + m.data.admins.length + '.</p>' +
            m.data.admins.map(function (a) { return '<p class="meta">' + esc(a.name) + (a.super ? " (Super Admin)" : "") + ' - two-step ' + (a.two_step ? "on" : "OFF") + '</p>'; }).join("") +
            (m.data.required ? "" : "<p class='meta'>When every admin has set up two-step login, the Super Admin should switch on \"Require two-step login for all admins\" on the Admin team page.</p>") +
            '<p>Last 7 days: visits by non-admins <strong>' + m.data.denied_7d + '</strong> - admins without the two-step code <strong>' + m.data.no_mfa_7d + '</strong></p>' +
            '<h3>Admin database functions (' + rows.length + ')</h3><p class="meta">Each one must check permission and must not be runnable by logged-out visitors. Anything listed below needs a look.</p>' +
            (bad.length ? bad.map(function (x) { return '<div class="business-card"><strong>' + esc(x.fn) + '</strong><p class="meta">' + (!x.guarded ? "No permission check found in its code. " : "") + (x.logged_out_can_run ? "Logged-out visitors can call it." : "") + '</p></div>'; }).join("") : "<p class='meta'>All " + rows.length + " have a permission check and none can be run logged out.</p>");
    }

    el("adminIpBtn").addEventListener("click", async function () {
        const { data, error } = await db.rpc("admin_sec_admin_ips");
        if (error) { fail(error); return; }
        const list = (data && data.places) || [];
        el("secAdminIps").innerHTML = '<p class="meta">Source: ' + esc(data.source) + (data.source === "open sessions" ? " (Supabase has no login history for these admins, so only the places of the sessions that are open now are shown)" : "") + (data.note ? " - " + esc(data.note) : "") + '</p>' + (list.length ? list.map(function (r) {
            return '<div class="business-card"><strong>' + esc(r.name) + '</strong> - ' + esc(r.ip) + (r.new_ip ? " - NEW PLACE (last 7 days)" : "") +
                '<p class="meta">' + r.logins + ' time(s) - first ' + esc(when(r.first_seen)) + ' - last ' + esc(when(r.last_seen)) + '</p></div>';
        }).join("") : "<p class='meta'>Nothing found.</p>");
    });

    // ----- 13I: legal holds and law enforcement requests -----
    async function loadLegal() {
        const { data, error } = await db.rpc("legal_overview");
        if (error) { el("legalHolds").innerHTML = ""; el("legalReqs").innerHTML = ""; say(error.message === "Not allowed" || /Super Admin/.test(error.message) ? "Only the Super Admin can open the legal records." : error.message, false); return; }
        say("", true);

        el("legalHolds").innerHTML = data.holds.length ? data.holds.map(function (h) {
            return '<div class="business-card" data-hold="' + esc(h.id) + '"><strong>' + esc(h.status === "active" ? "ACTIVE HOLD" : "Released") + '</strong> - ' + esc(h.case_ref) + ' - ' + esc(h.subject) +
                '<p class="meta">' + esc(h.reason) + ' - placed ' + esc(when(h.created_at)) + (h.status === "released" ? ' - released ' + esc(when(h.released_at)) + ': ' + esc(h.release_note) : "") + '</p>' +
                (h.status === "active" ? '<div class="filters"><input type="text" class="why" maxlength="500" placeholder="Why it is released (at least 10 characters)"><button type="button" class="btn btn-outline" data-release="1">Release hold</button></div>' : "") + '</div>';
        }).join("") : "<p class='meta'>No holds.</p>";

        el("legalReqs").innerHTML = data.requests.length ? data.requests.map(function (r) {
            const steps = (r.notes || []).map(function (n) { return '<p class="meta">' + esc(n.step.toUpperCase()) + ' - ' + esc(n.note) + ' (' + esc(when(n.at)) + ')</p>'; }).join("");
            const disc = (r.disclosures || []).map(function (d) { return '<p class="meta">DISCLOSED: ' + esc(d.what) + ' - to ' + esc(d.to_whom) + ' (' + esc(when(d.disclosed_at)) + ')</p>'; }).join("");
            let actions = "";
            if (r.status === "received") actions = '<button type="button" class="btn btn-outline" data-step="verify">Mark as verified</button>';
            if (r.status === "verified") actions = '<button type="button" class="btn btn-outline" data-step="approve">Approve</button><button type="button" class="btn btn-outline" data-step="decline">Decline</button>';
            if (r.status === "approved" || r.status === "disclosed") actions = '<button type="button" class="btn btn-outline" data-disclose="1">Record a disclosure</button>';
            if (r.status !== "closed") actions += '<button type="button" class="btn btn-outline" data-step="close">Close</button>';
            return '<div class="business-card" data-req="' + esc(r.id) + '"><strong>' + esc(r.status.toUpperCase()) + '</strong> - ' + esc(r.authority) + ' - ' + esc(r.reference) +
                '<p class="meta">Basis: ' + esc(r.legal_basis) + ' - received ' + esc(r.received_on) + '<br>Asking for: ' + esc(r.scope) + '</p>' + steps + disc +
                (r.status !== "closed" ? '<div class="filters"><input type="text" class="why" maxlength="500" placeholder="Note (at least 10 characters)"></div>' : "") +
                '<div class="filters">' + actions + '<button type="button" class="btn btn-outline" data-export="1">Export record</button></div></div>';
        }).join("") : "<p class='meta'>No requests.</p>";
    }

    el("holdForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        let uid = null;
        const em = el("holdEmail").value.trim();
        if (em) {
            const a = await db.rpc("admin_sec_account", { p_query: em });
            if (a.error) { fail(a.error); return; }
            if (!a.data) { say("No account with that email. Leave the email empty to hold by name only.", false); return; }
            uid = a.data.id;
        }
        const r = await db.rpc("legal_hold_add", { p_user: uid, p_subject: el("holdSubject").value, p_case: el("holdCase").value, p_reason: el("holdReason").value });
        if (r.error) fail(r.error); else { say("Hold placed.", true); e.target.reset(); loadLegal(); }
    });

    el("reqForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const r = await db.rpc("law_request_add", { p_authority: el("reqAuthority").value, p_reference: el("reqRef").value, p_basis: el("reqBasis").value, p_received: el("reqDate").value, p_scope: el("reqScope").value });
        if (r.error) fail(r.error); else { say("Request recorded.", true); e.target.reset(); loadLegal(); }
    });

    el("legalHolds").addEventListener("click", async function (e) {
        const b = e.target.closest("[data-release]");
        if (!b) return;
        const c = b.closest("[data-hold]");
        const r = await db.rpc("legal_hold_release", { p_id: c.dataset.hold, p_note: c.querySelector(".why").value });
        if (r.error) fail(r.error); else { say("Hold released.", true); loadLegal(); }
    });

    el("legalReqs").addEventListener("click", async function (e) {
        const c = e.target.closest("[data-req]");
        if (!c) return;
        const id = c.dataset.req;
        const note = c.querySelector(".why") ? c.querySelector(".why").value : "";
        let r = null;

        if (e.target.closest("[data-step]")) {
            const act = e.target.closest("[data-step]").dataset.step;
            if (act === "approve" && !confirm("Approve this request? Only do this if your lawyer agrees it is valid.")) return;
            r = await db.rpc("law_request_step", { p_id: id, p_action: act, p_note: note });
        } else if (e.target.closest("[data-disclose]")) {
            const what = prompt("Exactly what information was given? (for example: name and email only)");
            if (!what) return;
            const to = prompt("To whom? (officer name and office)");
            if (!to) return;
            r = await db.rpc("law_disclose", { p_id: id, p_what: what, p_to: to });
        } else if (e.target.closest("[data-export]")) {
            const x = await db.rpc("legal_export", { p_id: id });
            if (x.error) { fail(x.error); return; }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(x.data, null, 2)], { type: "application/json" }));
            a.download = "lbn-law-request-" + String(x.data.reference || id).replace(/[^A-Za-z0-9_-]/g, "") + ".json";
            a.click();
            say("Exported. This was recorded in the security log.", true);
            return;
        }
        if (r) { if (r.error) fail(r.error); else { say("Done.", true); loadLegal(); } }
    });

    // ----- 13.8: files -----
    async function loadFiles() {
        const { data, error } = await db.rpc("admin_sec_buckets");
        if (error) { fail(error); return; }
        el("secBuckets").innerHTML = data.map(function (b) {
            const bad = b.is_public && b.looks_private;
            return '<div class="business-card"><strong>' + esc(b.bucket) + '</strong> - ' + (bad ? "PUBLIC BUT LOOKS PRIVATE: CHECK NOW" : b.is_public ? "public" : "private") +
                '<p class="meta">Size limit ' + (b.size_limit_mb === null ? "NONE" : b.size_limit_mb + " MB") + ' - allowed types: ' + esc(b.file_types) + ' - files: ' + b.objects + '</p></div>';
        }).join("");
    }

    // ----- 13.9: secret scan of the live website files -----
    function maskOf(s) { return s.slice(0, 6) + "..." + s.slice(-2) + " (" + s.length + " characters)"; }

    function jwtRole(token) {
        try {
            const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            return (JSON.parse(atob(p + "===".slice((p.length + 3) % 4))) || {}).role || "";
        } catch (e) { return ""; }
    }

    const RULES = [
        { name: "Paystack SECRET key", sev: "critical", re: /sk_(live|test)_[A-Za-z0-9]{16,}/g },
        { name: "Private key", sev: "critical", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
        { name: "LiveKit secret in a file", sev: "critical", re: /LIVEKIT_API_SECRET\s*[=:]\s*["'][^"'\s]{16,}["']/g },
        { name: "Possible secret or password", sev: "warning", re: /(?:secret|password|passwd|api_?key|token)["']?\s*[:=]\s*["'][A-Za-z0-9\/+_\-]{28,}["']/gi }
    ];

    el("secScanBtn").addEventListener("click", async function () {
        const out = el("secSecrets");
        const btn = this;
        btn.disabled = true;
        out.innerHTML = "<p class='meta'>Reading the file list...</p>";

        try {
            const tree = await (await fetch("https://api.github.com/repos/odi-king/lagos-business-network/git/trees/master?recursive=1")).json();
            const files = (tree.tree || []).filter(function (f) { return f.type === "blob" && /\.(js|html|json|md|ts|sql|txt|webmanifest|css)$/i.test(f.path) && f.size < 1500000; });
            const findings = [];
            let done = 0;

            for (const f of files) {
                done++;
                if (done % 25 === 0) out.innerHTML = "<p class='meta'>Scanned " + done + " of " + files.length + " files...</p>";
                let text = "";
                try { text = await (await fetch(f.path, { cache: "no-store" })).text(); } catch (e) { continue; }
                if (text.length < 5 || /^\s*<!DOCTYPE html>/i.test(text) && !/\.html$/i.test(f.path)) continue;

                RULES.forEach(function (r) {
                    (text.match(r.re) || []).forEach(function (m) {
                        // Our own scanner and examples in comments are not secrets
                        if (/sk_\.\.\.|sk_test_\.\.\.|sk_live_\.\.\./.test(m)) return;
                        findings.push({ sev: r.sev, rule: r.name, file: f.path, sample: maskOf(m) });
                    });
                });

                (text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []).forEach(function (t) {
                    if (jwtRole(t) === "service_role") findings.push({ sev: "critical", rule: "Supabase SERVICE ROLE key", file: f.path, sample: maskOf(t) });
                });
            }

            const crit = findings.filter(function (x) { return x.sev === "critical"; }).length;

            out.innerHTML = "<p><strong>" + files.length + " files scanned. " + (findings.length ? findings.length + " possible problem(s)." : "No leaked secrets found.") + "</strong></p>" +
                findings.map(function (x) { return '<div class="business-card"><strong>' + esc(x.sev.toUpperCase()) + '</strong> - ' + esc(x.rule) + '<p class="meta">' + esc(x.file) + ' - ' + esc(x.sample) + '</p></div>'; }).join("") +
                (crit ? "<p class='msg error'>A secret key on a public website is stolen the moment it is pushed. Replace that key in the provider's dashboard right now, then remove it from the file.</p>" : "");

            if (findings.length) {
                await db.rpc("admin_sec_note", { p_severity: crit ? "critical" : "warning", p_message: "Secret scan found " + findings.length + " possible problem(s) in the website files (" + crit + " critical)" });
            } else {
                await db.rpc("admin_sec_note", { p_severity: "info", p_message: "Secret scan of " + files.length + " website files: nothing found" });
            }
        } catch (e) {
            out.innerHTML = "<p class='msg error'>The scan could not run: " + esc(e.message || "network problem") + ". Try again in a minute.</p>";
        }

        btn.disabled = false;
    });

    // ----- 13.10: accounts -----
    async function loadSuspended() {
        const { data } = await db.rpc("admin_sec_suspended");
        el("accList").innerHTML = (data || []).length ? data.map(function (u) { return '<p class="meta">' + esc(u.name) + ' - ' + esc(u.email) + '</p>'; }).join("") : "<p class='meta'>None.</p>";
    }

    el("accForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const { data, error } = await db.rpc("admin_sec_account", { p_query: el("accEmail").value });
        if (error) { fail(error); return; }
        if (!data) { el("accBox").innerHTML = "<p class='meta'>No account with that email.</p>"; return; }
        el("accBox").innerHTML = '<div class="business-card" data-user="' + esc(data.id) + '"><strong>' + esc(data.name) + '</strong> - ' + esc(data.email) + (data.suspended ? " - SUSPENDED" : "") +
            '<p class="meta">Last sign in ' + (data.last_sign_in_at ? esc(when(data.last_sign_in_at)) : "never") + ' - open sessions ' + (data.sessions === null ? "unknown" : data.sessions) + ' - two-step login ' + (data.two_step ? "on" : "off") + (data.is_admin ? " - ADMIN" : "") + '</p>' +
            '<div class="filters"><input type="text" class="why" maxlength="300" placeholder="Reason (required)">' +
            '<button type="button" class="btn btn-outline" data-acc="end_sessions">Sign out everywhere</button>' +
            (data.suspended ? '<button type="button" class="contact-btn" data-acc="restore">Restore the account</button>' : '<button type="button" class="btn btn-outline" data-acc="suspend">Suspend the account</button>') + '</div></div>';
    });

    el("accBox").addEventListener("click", async function (e) {
        const b = e.target.closest("[data-acc]");
        if (!b) return;
        const c = b.closest("[data-user]");
        if (b.dataset.acc === "suspend" && !confirm("Suspend this account? They are signed out and cannot log in until you restore it.")) return;
        const r = await db.rpc("admin_sec_account_action", { p_user: c.dataset.user, p_action: b.dataset.acc, p_reason: c.querySelector(".why").value });
        if (r.error) fail(r.error); else { say("Done.", true); el("accForm").requestSubmit(); loadSuspended(); }
    });

    // ----- 13.11: report -----
    let lastReport = null;

    async function loadReport() {
        const { data, error } = await db.rpc("admin_sec_report", { p_days: parseInt(el("repDays").value, 10) });
        if (error) { fail(error); return; }
        lastReport = data;
        el("secReport").innerHTML = '<p>Last ' + data.days + ' days: critical <strong>' + data.detected.critical + '</strong> - warnings <strong>' + data.detected.warning + '</strong> - info ' + data.detected.info + ' - resolved <strong>' + data.resolved + '</strong> - failed logins ' + data.failed_logins + ' - suspended accounts now ' + data.suspended_accounts + '</p>' +
            '<h3>Outstanding</h3>' + (data.outstanding.length ? data.outstanding.map(function (o) { return '<p class="meta">' + esc(o.severity.toUpperCase()) + ' - ' + esc(o.message) + ' (' + esc(when(o.created_at)) + ')</p>'; }).join("") : "<p class='meta'>Nothing outstanding.</p>") +
            '<h3>Resolved</h3>' + (data.resolved_list.length ? data.resolved_list.map(function (o) { return '<p class="meta">' + esc(o.severity.toUpperCase()) + ' - ' + esc(o.message) + ' - ' + esc(o.note) + '</p>'; }).join("") : "<p class='meta'>None yet.</p>");
    }

    el("repDays").addEventListener("change", loadReport);

    el("repCsv").addEventListener("click", function () {
        if (!lastReport) return;
        const q = function (v) { return '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"'; };
        const rows = [["status", "severity", "message", "note or details", "date"]];
        lastReport.outstanding.forEach(function (o) { rows.push(["outstanding", o.severity, o.message, o.details, o.created_at]); });
        lastReport.resolved_list.forEach(function (o) { rows.push(["resolved", o.severity, o.message, o.note, o.created_at]); });
        const blob = new Blob([rows.map(function (r) { return r.map(q).join(","); }).join("\n")], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "lbn-security-report.csv";
        a.click();
    });

    showTab("overview");
})();