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
        ["apps", "reps", "reports", "meetings", "countries", "leads"].forEach(function (t) { el("tab-" + t).style.display = t === n ? "" : "none"; });
        document.querySelectorAll(".rep-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === n); });
        if (n === "apps") loadApps();
        if (n === "reps") loadReps();
        if (n === "reports") loadReports();
        if (n === "meetings") loadMeetings();
        if (n === "countries") loadCountries();
        if (n === "leads") loadLeads();
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

    // ----- Conference room -----
    let repsCache = [];

    async function loadMeetings() {
        const l = await db.rpc("admin_conf_list");
        if (l.error) { fail(l.error); return; }
        repsCache = (await db.rpc("admin_conf_reps")).data || [];
        const SC = { all_reps: "All Representatives", selected: "Chosen Representatives", management: "Management only" };

        el("meetList").innerHTML = (l.data || []).length ? l.data.map(function (c) {
            const open = c.status === "scheduled" || c.status === "live";
            return '<div class="business-card" data-conf="' + escapeHTML(c.id) + '"><strong>' + escapeHTML(c.title) + '</strong> - ' + escapeHTML(c.status.toUpperCase()) + (c.locked ? " - LOCKED" : "") +
                '<p class="meta">' + escapeHTML(new Date(c.starts_at).toLocaleString()) + ' - ' + escapeHTML(SC[c.scope]) + ' - ' + (c.everyone_speaks ? "everyone may speak" : "speaking by permission") + '</p>' +
                (c.scope === "selected" && open ? '<p class="meta">Invited: ' + (c.invited.length ? c.invited.map(function (i) { return escapeHTML(i.name) + ' <a href="#" data-uninvite="' + escapeHTML(i.user_id) + '">x</a>'; }).join(", ") : "nobody yet") + '</p>' +
                    '<div class="filters"><select class="mi">' + repsCache.map(function (r) { return '<option value="' + escapeHTML(r.user_id) + '">' + escapeHTML(r.name) + '</option>'; }).join("") + '</select><button type="button" class="btn btn-outline" data-invite>Invite</button></div>' : '') +
                (open ? '<div class="filters">' +
                    (c.status === "scheduled" ? '<button type="button" class="contact-btn" data-set="start">Start the meeting</button><button type="button" class="btn btn-outline" data-set="cancel">Cancel</button>' : '<a class="contact-btn" href="conference.html?c=' + escapeHTML(c.id) + '">Open the room</a><button type="button" class="btn btn-outline" data-set="end">End the meeting</button>') +
                    '<button type="button" class="btn btn-outline" data-set="' + (c.locked ? "unlock" : "lock") + '">' + (c.locked ? "Unlock the room" : "Lock the room") + '</button>' +
                    '<button type="button" class="btn btn-outline" data-set="' + (c.everyone_speaks ? "controlled" : "everyone_speaks") + '">' + (c.everyone_speaks ? "Speaking by permission" : "Let everyone speak") + '</button></div>' : '') + '</div>';
        }).join("") : "<p class='meta'>No meetings yet.</p>";
    }

    el("meetForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const r = await db.rpc("admin_conf_create", { p_title: el("mTitle").value, p_starts: new Date(el("mWhen").value).toISOString(), p_scope: el("mScope").value, p_everyone_speaks: el("mSpeak").checked });
        if (r.error) fail(r.error); else { el("mTitle").value = ""; say("Meeting created.", true); loadMeetings(); }
    });

    el("meetList").addEventListener("click", async function (e) {
        const card = e.target.closest("[data-conf]");
        if (!card) return;
        const id = card.dataset.conf;
        let r;
        const un = e.target.closest("[data-uninvite]");
        if (un) { e.preventDefault(); r = await db.rpc("admin_conf_invite", { p_conf: id, p_user: un.dataset.uninvite, p_add: false }); }
        else if (e.target.closest("[data-invite]")) { r = await db.rpc("admin_conf_invite", { p_conf: id, p_user: card.querySelector(".mi").value, p_add: true }); }
        else if (e.target.closest("[data-set]")) {
            const a = e.target.closest("[data-set]").dataset.set;
            if ((a === "end" || a === "cancel") && !confirm("Are you sure?")) return;
            r = await db.rpc("admin_conf_set", { p_conf: id, p_action: a });
        } else { return; }
        if (r.error) fail(r.error); else loadMeetings();
    });

    // ----- Countries (expansion monitoring, performance, management review) -----
    const STAGE = { research: "Research", planned: "Planned", pilot: "Pilot", live: "Live", paused: "Paused" };
    const REVIEW = { on_track: "On track", needs_attention: "Needs attention", at_risk: "At risk" };

    function fillCountryList() {
        el("cList").innerHTML = (window.LBN_COUNTRIES || []).map(function (c) { return '<option value="' + escapeHTML(c[1]) + '">'; }).join("");
    }

    async function loadCountries() {
        fillCountryList();
        const { data, error } = await db.rpc("admin_countries");
        if (error) { fail(error); return; }
        el("ctryList").innerHTML = (data || []).length ? data.map(function (c) {
            return '<div class="business-card" data-cc="' + escapeHTML(c.country_code) + '" data-cn="' + escapeHTML(c.country) + '"><strong>' + escapeHTML(c.country) + '</strong> - ' + escapeHTML(STAGE[c.stage]) +
                (c.review_status ? ' - <strong>' + escapeHTML(REVIEW[c.review_status]) + '</strong>' : '') +
                '<p class="meta">LBN members ' + c.members + (c.target_members ? ' of target ' + c.target_members : '') + ' (paying ' + c.paid_members + ') - Representatives ' + c.reps + ' - Leads ' + c.leads + ' (in progress ' + c.in_progress + ', onboarded ' + c.onboarded + ')</p>' +
                '<p class="meta">Reports ' + c.reports + ' - average rating ' + (c.avg_rating === null ? "none" : c.avg_rating) + ' - members recruited in 90 days ' + c.recruited_90d + '</p>' +
                (c.plan ? '<p>' + escapeHTML(c.plan) + '</p>' : '') + (c.review_note ? '<p class="meta">Review note: ' + escapeHTML(c.review_note) + '</p>' : '') +
                '<div class="filters"><select class="rs"><option value="on_track">On track</option><option value="needs_attention">Needs attention</option><option value="at_risk">At risk</option></select>' +
                '<input type="text" class="rnote" maxlength="500" placeholder="Review note (needed unless on track)"><button type="button" class="contact-btn" data-review>Save review</button>' +
                '<button type="button" class="btn btn-outline" data-edit>Edit plan</button><button type="button" class="btn btn-outline" data-clog>Record</button></div><div class="meta clg"></div></div>';
        }).join("") : "<p class='meta'>No countries yet.</p>";
    }

    el("ctryForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const code = codeFor(el("cName").value);
        if (!code) { say("Choose the country from the list.", false); return; }
        const r = await db.rpc("admin_country_set", { p_code: code, p_country: el("cName").value.trim(), p_stage: el("cStage").value, p_target: el("cTarget").value ? parseInt(el("cTarget").value, 10) : null, p_plan: el("cPlan").value });
        if (r.error) fail(r.error); else { say("Saved.", true); loadCountries(); }
    });

    el("ctryList").addEventListener("click", async function (e) {
        const card = e.target.closest("[data-cc]");
        if (!card) return;
        if (e.target.closest("[data-review]")) {
            const r = await db.rpc("admin_country_review", { p_code: card.dataset.cc, p_status: card.querySelector(".rs").value, p_note: card.querySelector(".rnote").value });
            if (r.error) fail(r.error); else loadCountries();
        } else if (e.target.closest("[data-edit]")) {
            el("cName").value = card.dataset.cn;
            el("cName").scrollIntoView();
        } else if (e.target.closest("[data-clog]")) {
            const l = await db.rpc("admin_country_log", { p_code: card.dataset.cc });
            card.querySelector(".clg").innerHTML = (l.data || []).map(function (x) { return escapeHTML(day(x.created_at) + " - " + x.action + " - " + (x.details || "") + " (" + (x.actor || "?") + ")"); }).join("<br>") || "No records yet.";
        }
    });

    async function loadLeads() {
        fillCountryList();
        const { data, error } = await db.rpc("admin_biz_leads", { p_code: codeFor(el("lCountry").value) || null, p_stage: el("lStage").value || null });
        if (error) { fail(error); return; }
        el("leadList").innerHTML = (data || []).length ? data.map(function (l) {
            return '<div class="business-card"><strong>' + escapeHTML(l.business_name) + '</strong> - ' + escapeHTML(l.country_code) + ' - ' + escapeHTML(l.stage) +
                '<p class="meta">Owner: ' + escapeHTML(l.owner_name) + (l.sector ? ' - ' + escapeHTML(l.sector) : '') + (l.contact ? ' - ' + escapeHTML(l.contact) : '') + (l.next_step_on ? ' - next step ' + escapeHTML(l.next_step_on) : '') + '</p>' +
                (l.notes ? '<p class="meta">' + escapeHTML(l.notes) + '</p>' : '') + '</div>';
        }).join("") : "<p class='meta'>No leads.</p>";
    }

    el("lGo").addEventListener("click", loadLeads);

    showTab(location.hash === "#meetings" ? "meetings" : "apps");
})();