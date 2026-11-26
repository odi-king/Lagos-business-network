// LBN Phase 11D: admin page for International Representatives. Works with supabase-representatives.sql (Members permission).

function escapeHTML(t) { return String(t === null || t === undefined ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

(function () {
    function el(id) { return document.getElementById(id); }
    function say(t, ok) { const m = el("repMsg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }
    function day(t) { return new Date(t).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }
    function fail(e) { say(e.message === "Not allowed" ? "You do not have permission to open this page." : e.message, false); }
    function codeFor(name) {
        const v = String(name || "").trim().toLowerCase();
        const hit = (window.LBN_COUNTRIES || []).filter(function (c) { return c[1].toLowerCase() === v; })[0];
        return hit ? hit[0] : "";
    }

    function showTab(n) {
        ["apps", "reps", "reports"].forEach(function (t) { el("tab-" + t).style.display = t === n ? "" : "none"; });
        document.querySelectorAll(".rep-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === n); });
        if (n === "apps") loadApps();
        if (n === "reps") loadReps();
        if (n === "reports") loadReports();
    }

    el("repTabs").addEventListener("click", function (e) { const b = e.target.closest(".rep-tab"); if (b) showTab(b.dataset.tab); });
    el("appStatus").addEventListener("change", loadApps);
    el("onlyNew").addEventListener("change", loadReports);

    async function loadApps() {
        const { data, error } = await db.rpc("admin_rep_applications", { p_status: el("appStatus").value });
        if (error) { fail(error); return; }
        say("", true);
        el("appList").innerHTML = (data || []).length ? data.map(function (a) {
            const open = ["submitted", "reviewing", "interview"].indexOf(a.status) >= 0;
            return '<div class="business-card" data-app="' + escapeHTML(a.id) + '"><strong>' + escapeHTML(a.name) + '</strong> wants ' + escapeHTML(a.country) + ' - ' + escapeHTML(a.status) +
                '<p class="meta">Lives in: ' + escapeHTML(a.home_country || "not saved") + (a.city ? ", " + escapeHTML(a.city) : "") + ' - Paid member: ' + (a.paid_member ? "yes" : "NO") + ' - Languages: ' + escapeHTML(a.languages || "-") + ' - ' + day(a.created_at) + '</p>' +
                '<p>' + escapeHTML(a.motivation) + '</p><p class="meta">Experience: ' + escapeHTML(a.experience || "-") + '</p>' +
                (a.review_note ? '<p class="meta">Note: ' + escapeHTML(a.review_note) + '</p>' : '') +
                (open ? '<div class="filters"><label><input type="checkbox" class="av"' + (a.verified ? " checked" : "") + '> Identity and background verified</label>' +
                    '<input type="text" class="an" maxlength="500" placeholder="Note (required to reject)">' +
                    '<button type="button" class="btn btn-outline" data-do="reviewing">Under review</button>' +
                    '<button type="button" class="btn btn-outline" data-do="interview">Interview</button>' +
                    '<button type="button" class="contact-btn" data-do="approved">Approve</button>' +
                    '<button type="button" class="btn btn-outline" data-do="rejected">Reject</button></div>' : '') + '</div>';
        }).join("") : "<p class='meta'>Nothing here.</p>";
    }

    el("appList").addEventListener("click", async function (e) {
        const b = e.target.closest("button[data-do]");
        if (!b) return;
        const c = b.closest("[data-app]");
        if (b.dataset.do === "approved" && !confirm("Appoint this person as an LBN International Representative?")) return;
        const { error } = await db.rpc("admin_rep_decide", { p_id: c.dataset.app, p_status: b.dataset.do, p_note: c.querySelector(".an").value, p_verified: c.querySelector(".av").checked });
        if (error) fail(error); else loadApps();
    });

    async function loadReps() {
        const { data, error } = await db.rpc("admin_reps");
        if (error) { fail(error); return; }
        el("repList").innerHTML = (data || []).length ? data.map(function (r) {
            return '<div class="business-card" data-rep="' + escapeHTML(r.user_id) + '"><strong>' + escapeHTML(r.name) + '</strong> - ' + escapeHTML(r.status) + ' - since ' + day(r.appointed_at) +
                '<p class="meta">Reports: ' + r.reports + ' - average rating: ' + (r.avg_rating === null ? "none yet" : r.avg_rating) + ' - last report: ' + escapeHTML(r.last_report || "none") + '</p>' +
                (r.countries.length ? r.countries.map(function (c) {
                    return '<p>' + escapeHTML(c.country) + ' <span class="meta">(' + c.members + ' LBN members there)</span> <button type="button" class="btn btn-outline" data-unassign="' + escapeHTML(c.id) + '">End</button></p>';
                }).join("") : '<p class="meta">No country assigned.</p>') +
                '<div class="filters"><input type="text" class="ac" list="repCountryList" placeholder="Assign another country"><button type="button" class="btn btn-outline" data-assign>Assign</button></div>' +
                '<div class="filters"><input type="text" class="rn" maxlength="300" placeholder="Reason (needed to suspend or end)">' +
                '<button type="button" class="btn btn-outline" data-status="active">Activate</button>' +
                '<button type="button" class="btn btn-outline" data-status="suspended">Suspend</button>' +
                '<button type="button" class="btn btn-outline" data-status="ended">End</button>' +
                '<button type="button" class="btn btn-outline" data-log>Record</button></div><div class="meta rlog"></div></div>';
        }).join("") + '<datalist id="repCountryList">' + (window.LBN_COUNTRIES || []).map(function (c) { return '<option value="' + escapeHTML(c[1]) + '">'; }).join("") + '</datalist>' : "<p class='meta'>No Representatives yet.</p>";
    }

    el("repList").addEventListener("click", async function (e) {
        const card = e.target.closest("[data-rep]");
        if (!card) return;
        const id = card.dataset.rep;
        let r;

        if (e.target.closest("[data-unassign]")) {
            r = await db.rpc("admin_rep_unassign", { p_assignment: e.target.closest("[data-unassign]").dataset.unassign });
        } else if (e.target.closest("[data-assign]")) {
            const name = card.querySelector(".ac").value;
            const code = codeFor(name);
            if (!code) { say("Choose the country from the list.", false); return; }
            r = await db.rpc("admin_rep_assign", { p_rep: id, p_code: code, p_country: name.trim() });
        } else if (e.target.closest("[data-status]")) {
            const s = e.target.closest("[data-status]").dataset.status;
            if (s !== "active" && !confirm("Are you sure? The Representative is told.")) return;
            r = await db.rpc("admin_rep_set_status", { p_rep: id, p_status: s, p_note: card.querySelector(".rn").value });
        } else if (e.target.closest("[data-log]")) {
            const l = await db.rpc("admin_rep_log", { p_rep: id });
            card.querySelector(".rlog").innerHTML = (l.data || []).map(function (x) { return escapeHTML(day(x.created_at) + " - " + x.action + " - " + (x.details || "") + " (" + (x.actor || "?") + ")"); }).join("<br>") || "No records yet.";
            return;
        } else { return; }

        if (r.error) fail(r.error); else loadReps();
    });

    async function loadReports() {
        const { data, error } = await db.rpc("admin_rep_reports", { p_only_new: el("onlyNew").checked });
        if (error) { fail(error); return; }
        el("reportList").innerHTML = (data || []).length ? data.map(function (p) {
            return '<div class="business-card" data-report="' + escapeHTML(p.id) + '"><strong>' + escapeHTML(p.name) + '</strong> - ' + escapeHTML(p.country_code) + ' - ' + escapeHTML(p.period) + (p.rating ? ' - rated ' + p.rating + '/5' : '') +
                '<p class="meta">Businesses contacted ' + p.businesses_contacted + ' - Members recruited ' + p.members_recruited + ' - Events ' + p.events_held + '</p><p>' + escapeHTML(p.summary) + '</p>' +
                '<div class="filters"><select class="rr"><option value="5">5 - excellent</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1 - poor</option></select>' +
                '<input type="text" class="rv" maxlength="500" placeholder="Note to the Representative (optional)"><button type="button" class="contact-btn" data-rate>Save rating</button></div></div>';
        }).join("") : "<p class='meta'>No reports.</p>";
    }

    el("reportList").addEventListener("click", async function (e) {
        const b = e.target.closest("button[data-rate]");
        if (!b) return;
        const c = b.closest("[data-report]");
        const { error } = await db.rpc("admin_rep_review_report", { p_id: c.dataset.report, p_rating: parseInt(c.querySelector(".rr").value, 10), p_note: c.querySelector(".rv").value });
        if (error) fail(error); else loadReports();
    });

    showTab("apps");
})();