// LBN Phase 17B: University Marketing Department, admin screen. Works with supabase-marketing.sql and marketing-common.js.
(function () {
    const M = window.MKT;
    const el = M.el, esc = M.esc, rpc = M.rpc;
    let isSuper = false, canFinance = false;
    let institutions = [], roles = [], settings = null;
    let curCampaign = null;

    function err(id, e) { M.say(id, M.friendly(e)); }

    // ---------- Tabs ----------
    function showTab(name) {
        ["dash", "inst", "team", "camp", "set"].forEach(function (t) { el("tab-" + t).style.display = t === name ? "" : "none"; });
        document.querySelectorAll("#tabs [data-tab]").forEach(function (b) { b.className = "btn " + (b.getAttribute("data-tab") === name ? "btn-primary" : "btn-outline"); });
        if (name === "dash") loadDash();
        if (name === "inst") loadInst();
        if (name === "team") loadTeam();
        if (name === "camp") loadCampaigns();
        if (name === "set") loadSettings();
    }

    async function loadInstitutions() {
        const r = await rpc("mkt_institution_list");
        institutions = r.error ? [] : (r.data || []);
        if (r.error) { M.say("pgMsg", M.friendly(r.error)); }
        const opts = institutions.map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + "</option>"; }).join("");
        const keepT = el("teamInst").value, keepC = el("campInst").value;
        el("teamInst").innerHTML = '<option value="">Choose an institution</option>' + opts;
        el("campInst").innerHTML = '<option value="">All institutions</option>' + opts;
        el("teamInst").value = keepT; el("campInst").value = keepC;
    }

    // ---------- Dashboard ----------
    async function loadDash() {
        const box = el("tab-dash");
        box.innerHTML = '<p class="meta">Loading...</p>';
        const r = await rpc("mkt_dashboard");
        if (r.error) { box.innerHTML = '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>"; return; }
        const d = r.data;
        function s(label, v) { return '<div class="stat"><b>' + esc(v) + "</b><span class=\"meta\">" + esc(label) + "</span></div>"; }
        box.innerHTML = '<div class="grid-4">' +
            s("Active institutions", d.institutions) + s("Active promoters", d.promoters) + s("Campaigns running", d.campaigns_active) + s("Campaigns completed", d.campaigns_completed) +
            s("Student registrations", d.student_regs) + s("Business registrations", d.business_regs) + s("Verified referrals", d.verified) + s("Active members acquired", d.active_members) +
            s("Paid out", M.naira(d.spend_paid_kobo)) + s("Approved, not paid", M.naira(d.spend_approved_kobo)) + s("Prepared, waiting approval", M.naira(d.spend_prepared_kobo)) +
            s("Total spend (all three)", M.naira(Number(d.spend_paid_kobo) + Number(d.spend_approved_kobo) + Number(d.spend_prepared_kobo))) + "</div>" +
            '<h3 style="margin:0 0 6px;">Institution by institution</h3><div class="scroll"><table class="t"><tr><th>Institution</th><th>Promoters</th><th>Running</th><th>Done</th><th>Students</th><th>Businesses</th><th>Verified</th><th>Active members</th><th>Spend</th><th>Cost per active member</th></tr>' +
            (d.by_institution || []).map(function (i) {
                const per = i.active_members > 0 ? M.naira(Math.round(i.spend_kobo / i.active_members)) : "-";
                return "<tr><td>" + esc(i.name) + (i.status !== "active" ? '<span class="badge">' + esc(i.status) + "</span>" : "") + "</td><td>" + i.promoters + "</td><td>" + i.campaigns_active + "</td><td>" + i.campaigns_done + "</td><td>" + i.student_regs + "</td><td>" + i.business_regs + "</td><td>" + i.verified + "</td><td>" + i.active_members + "</td><td>" + M.naira(i.spend_kobo) + "</td><td>" + per + "</td></tr>";
            }).join("") + "</table></div>" +
            '<p class="meta">Registrations come from the real referral records of each promoter inside the campaign dates. "Verified" means not flagged as suspicious. "Active members" have a live membership now.</p>';
    }

    // ---------- Institutions ----------
    let editInst = null;
    async function loadInst() {
        await loadInstitutions();
        el("inNew").style.display = isSuper ? "" : "none";
        el("instList").innerHTML = institutions.length ? '<div class="scroll"><table class="t"><tr><th>Name</th><th>Type</th><th>Place</th><th>People / places</th><th>Campaigns running</th><th></th></tr>' + institutions.map(function (i) {
            return "<tr><td><strong>" + esc(i.name) + "</strong>" + (i.short_name ? " (" + esc(i.short_name) + ")" : "") + (i.status !== "active" ? '<span class="badge">' + esc(i.status) + "</span>" : "") + "</td><td>" + esc(i.kind.replace(/_/g, " ")) + "</td><td>" + esc([i.city, i.state].filter(Boolean).join(", ")) + "</td><td>" + i.people + " / " + i.places + "</td><td>" + i.active_campaigns + '</td><td><button type="button" class="btn btn-outline" data-open="' + esc(i.id) + '" style="padding:4px 10px;">Open team</button>' + (isSuper ? ' <button type="button" class="btn btn-outline" data-edit="' + esc(i.id) + '" style="padding:4px 10px;">Edit</button>' : "") + "</td></tr>";
        }).join("") + "</table></div>" : '<p class="meta">No institutions yet. The Super Admin adds the first one.</p>';
    }

    function openForm(i) {
        editInst = i || null;
        el("instForm").style.display = "";
        el("instFormTitle").textContent = i ? "Edit " + i.name : "Add an institution";
        el("inName").value = i ? i.name : ""; el("inShort").value = i ? (i.short_name || "") : "";
        el("inKind").value = i ? i.kind : "university"; el("inCity").value = i ? (i.city || "") : ""; el("inState").value = i ? (i.state || "") : "";
        el("inStatus").value = i ? i.status : "active"; el("inNotes").value = i ? (i.notes || "") : "";
        el("inStatus").style.display = i ? "" : "none";
    }

    el("inNew").addEventListener("click", function () { openForm(null); });
    el("inCancel").addEventListener("click", function () { el("instForm").style.display = "none"; });
    el("inSave").addEventListener("click", async function () {
        let r;
        if (editInst) {
            r = await rpc("mkt_institution_update", { p_id: editInst.id, p_name: el("inName").value, p_short: el("inShort").value, p_kind: el("inKind").value, p_city: el("inCity").value, p_state: el("inState").value, p_status: el("inStatus").value, p_notes: el("inNotes").value });
        } else {
            r = await rpc("mkt_institution_create", { p_name: el("inName").value, p_short: el("inShort").value, p_kind: el("inKind").value, p_city: el("inCity").value, p_state: el("inState").value });
        }
        if (r.error) { err("inMsg", r.error); return; }
        M.say("inMsg", "Saved.", true);
        el("instForm").style.display = "none";
        loadInst();
    });
    el("instList").addEventListener("click", function (e) {
        const o = e.target.closest("[data-open]"), d = e.target.closest("[data-edit]");
        if (o) { el("teamInst").value = o.getAttribute("data-open"); showTab("team"); }
        if (d) { openForm(institutions.find(function (i) { return i.id === d.getAttribute("data-edit"); })); }
    });

    // ---------- Team ----------
    let team = null, found = [];
    async function loadTeam() {
        await loadInstitutions();
        const id = el("teamInst").value;
        if (!id) { el("teamBox").innerHTML = '<p class="meta">Choose an institution.</p>'; return; }
        el("teamBox").innerHTML = '<p class="meta">Loading...</p>';
        const r = await rpc("mkt_team_get", { p_inst: id });
        if (r.error) { el("teamBox").innerHTML = '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>"; return; }
        team = r.data;
        const roleOpts = team.roles.map(function (x) { return '<option value="' + esc(x.role_key) + '">' + esc(x.title) + "</option>"; }).join("");
        const instOpts = institutions.filter(function (i) { return i.id !== id && i.status === "active"; }).map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.name) + "</option>"; }).join("");
        el("teamBox").innerHTML =
            '<h3 style="margin:0 0 6px;">' + esc(team.institution.name) + '</h3>' +
            '<h4 style="margin:10px 0 6px;">Places in the team</h4><div class="scroll"><table class="t"><tr><th>Role</th><th>Filled</th><th>Places</th><th>What they do</th></tr>' + team.roles.map(function (x) {
                return "<tr><td>" + esc(x.title) + "</td><td>" + x.filled + "</td><td>" + (isSuper ? '<input type="number" min="0" max="100" value="' + x.slots + '" data-slots="' + esc(x.role_key) + '" style="width:70px;"> <button type="button" class="btn btn-outline" data-saveslots="' + esc(x.role_key) + '" style="padding:2px 8px;">Save</button>' : x.slots) + '</td><td class="meta">' + esc(x.responsibilities) + "</td></tr>";
            }).join("") + "</table></div>" +
            '<h4 style="margin:14px 0 6px;">People (' + team.members.length + ")</h4>" + (team.members.length ? team.members.map(function (m) {
                return '<div class="business-card"><strong>' + esc(m.name) + "</strong>" + (m.status !== "active" ? '<span class="badge">' + esc(m.status) + "</span>" : "") + (m.on_campaign ? '<span class="badge on">on a campaign</span>' : '<span class="badge">standby</span>') + '<p class="meta">' + esc(m.role_title) + (m.email ? " - " + esc(m.email) : "") + '</p><div class="filters">' +
                    '<select data-role="' + esc(m.id) + '">' + roleOpts + "</select>" +
                    '<button type="button" class="btn btn-outline" data-setrole="' + esc(m.id) + '" style="padding:4px 10px;">Change role</button>' +
                    (m.status === "active" ? '<button type="button" class="btn btn-outline" data-status="suspended" data-m="' + esc(m.id) + '" style="padding:4px 10px;">Suspend</button>' : '<button type="button" class="btn btn-outline" data-status="active" data-m="' + esc(m.id) + '" style="padding:4px 10px;">Reactivate</button>') +
                    '<button type="button" class="btn btn-outline" data-status="ended" data-m="' + esc(m.id) + '" style="padding:4px 10px;">Remove from team</button>' +
                    (isSuper && instOpts ? '<select data-to="' + esc(m.id) + '"><option value="">Transfer to...</option>' + instOpts + '</select><button type="button" class="btn btn-outline" data-transfer="' + esc(m.id) + '" style="padding:4px 10px;">Transfer</button>' : "") +
                    "</div></div>";
            }).join("") : '<p class="meta">Nobody yet.</p>') +
            '<h4 style="margin:14px 0 6px;">Add a person</h4><p class="meta">The person needs an LBN account. Search by name or email (at least 3 letters).</p>' +
            '<div class="filters"><input type="text" id="tmFind" placeholder="Name or email"><button type="button" class="btn btn-outline" id="tmFindBtn">Search</button></div><div id="tmFound"></div>' +
            '<h4 style="margin:14px 0 6px;">Call the team</h4><p class="meta">Send everyone in this team a notification, for example before a campaign starts.</p>' +
            '<div class="filters"><input type="text" id="tmCall" maxlength="200" placeholder="Message, e.g. December campaign starts on Monday"><button type="button" class="btn btn-outline" id="tmCallBtn">Send</button></div>' +
            '<p id="tmMsg" class="msg"></p>';
        team.members.forEach(function (m) { const s = document.querySelector('[data-role="' + m.id + '"]'); if (s) s.value = m.role_key; });
    }
    el("teamInst").addEventListener("change", loadTeam);

    el("teamBox").addEventListener("click", async function (e) {
        const t = e.target;
        let r;
        const ss = t.closest("[data-saveslots]");
        if (ss) {
            const k = ss.getAttribute("data-saveslots");
            const role = team.roles.find(function (x) { return x.role_key === k; });
            r = await rpc("mkt_slots_set", { p_inst: team.institution.id, p_role: k, p_slots: parseInt(document.querySelector('[data-slots="' + k + '"]').value, 10), p_resp: role.responsibilities });
        }
        const sr = t.closest("[data-setrole]");
        if (sr) r = await rpc("mkt_member_change_role", { p_member: sr.getAttribute("data-setrole"), p_role: document.querySelector('[data-role="' + sr.getAttribute("data-setrole") + '"]').value });
        const st = t.closest("[data-status]");
        if (st) {
            const s = st.getAttribute("data-status");
            if (s === "ended" && !window.confirm("Remove this person from the team? They stay in the pay history.")) return;
            r = await rpc("mkt_member_set_status", { p_member: st.getAttribute("data-m"), p_status: s, p_note: null });
        }
        const tr = t.closest("[data-transfer]");
        if (tr) {
            const id = tr.getAttribute("data-transfer");
            const to = document.querySelector('[data-to="' + id + '"]').value;
            if (!to) { M.say("tmMsg", "Choose the institution to move them to."); return; }
            const why = window.prompt("Reason for the transfer (it is recorded):");
            if (!why) return;
            const m = team.members.find(function (x) { return x.id === id; });
            r = await rpc("mkt_member_transfer", { p_member: id, p_to: to, p_role: m.role_key, p_reason: why });
        }
        const fb = t.closest("#tmFindBtn");
        if (fb) {
            const q = el("tmFind").value;
            const f = await rpc("mkt_find_account", { p_query: q });
            if (f.error) { err("tmMsg", f.error); return; }
            found = f.data || [];
            const roleOpts = team.roles.map(function (x) { return '<option value="' + esc(x.role_key) + '">' + esc(x.title) + "</option>"; }).join("");
            el("tmFound").innerHTML = found.length ? found.map(function (p) {
                return '<div class="business-card"><strong>' + esc(p.full_name) + '</strong> <span class="meta">' + esc(p.email) + " - " + esc(p.role) + (p.institution ? " - " + esc(p.institution) : "") + "</span>" + (p.in_team ? ' <span class="badge">already in a team</span>' : '<div class="filters"><select data-addrole="' + esc(p.id) + '">' + roleOpts + '</select><button type="button" class="btn btn-primary" data-add="' + esc(p.id) + '" style="padding:4px 10px;">Add to team</button></div>') + "</div>";
            }).join("") : '<p class="meta">Nobody found.</p>';
            return;
        }
        const ad = t.closest("[data-add]");
        if (ad) r = await rpc("mkt_member_add", { p_inst: team.institution.id, p_user: ad.getAttribute("data-add"), p_role: document.querySelector('[data-addrole="' + ad.getAttribute("data-add") + '"]').value, p_note: null });
        const cb = t.closest("#tmCallBtn");
        if (cb) {
            r = await rpc("mkt_call_team", { p_inst: team.institution.id, p_message: el("tmCall").value });
            if (!r.error) { await loadTeam(); M.say("tmMsg", "Sent to " + r.data + " people.", true); return; }
        }
        if (r === undefined) return;
        if (r.error) { err("tmMsg", r.error); return; }
        await loadTeam();
        M.say("tmMsg", "Done.", true);
    });

    // ---------- Campaigns ----------
    async function loadCampaigns() {
        await loadInstitutions();
        const inst = el("campInst").value || null;
        const r = await rpc("mkt_campaign_list", { p_inst: inst });
        if (r.error) { el("campList").innerHTML = '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>"; return; }
        const rows = r.data || [];
        el("campList").innerHTML = rows.length ? '<div class="scroll"><table class="t"><tr><th>Campaign</th><th>Institution</th><th>Dates</th><th>Status</th><th>People</th><th>Students</th><th>Businesses</th><th>Verified</th><th>Active</th><th></th></tr>' + rows.map(function (c) {
            return "<tr><td><strong>" + esc(c.name) + "</strong></td><td>" + esc(c.institution) + "</td><td>" + esc(M.fdate(c.start_date)) + " - " + esc(M.fdate(c.end_date)) + '</td><td><span class="badge ' + (c.status === "active" ? "on" : "") + '">' + esc(c.status) + "</span></td><td>" + c.people + "</td><td>" + c.student_regs + (c.target_student_regs ? " / " + c.target_student_regs : "") + "</td><td>" + c.business_regs + (c.target_business_regs ? " / " + c.target_business_regs : "") + "</td><td>" + c.verified + (c.target_verified ? " / " + c.target_verified : "") + "</td><td>" + c.active_members + (c.target_active_members ? " / " + c.target_active_members : "") + '</td><td><button type="button" class="btn btn-outline" data-camp="' + esc(c.id) + '" style="padding:4px 10px;">Open</button></td></tr>';
        }).join("") + "</table></div>" : '<p class="meta">No campaigns yet. Teams stay on standby until you create one.</p>';
    }
    el("campInst").addEventListener("change", loadCampaigns);
    el("campList").addEventListener("click", function (e) { const b = e.target.closest("[data-camp]"); if (b) openCampaign(b.getAttribute("data-camp")); });

    function campForm(c) {
        const t = M.todayLagos();
        const def = settings || { default_rate_kobo: 1000000, default_days: 30 };
        const v = c || { name: "", instructions: "", start_date: t, end_date: M.addDays(t, def.default_days - 1), pay_basis: "daily", rate_kobo: def.default_rate_kobo, work_days_per_week: 5, work_days_per_month: 22, target_student_regs: 0, target_verified: 0, target_business_regs: 0, target_active_members: 0, bonus_per_verified_kobo: 0, bonus_threshold: 0, institution_id: el("campInst").value };
        const instOpts = institutions.filter(function (i) { return i.status === "active"; }).map(function (i) { return '<option value="' + esc(i.id) + '"' + (i.id === v.institution_id ? " selected" : "") + ">" + esc(i.name) + "</option>"; }).join("");
        function f(id, label, val, type, extra) { return '<label class="meta">' + label + '<input type="' + (type || "text") + '" id="' + id + '" value="' + esc(val) + '" ' + (extra || "") + "></label>"; }
        el("campForm").style.display = "";
        el("campForm").innerHTML = '<div class="panel" style="margin-top:10px;"><h4 style="margin:0 0 8px;">' + (c ? "Edit campaign" : "New campaign") + '</h4><div class="row2">' +
            (c ? "" : '<label class="meta">Institution<select id="cfInst">' + instOpts + "</select></label>") +
            f("cfName", "Campaign name", v.name, "text", 'maxlength="120"') + f("cfStart", "Starts", v.start_date, "date") + f("cfEnd", "Ends", v.end_date, "date") +
            '<label class="meta">Pay is counted<select id="cfBasis"><option value="daily">Per working day</option><option value="weekly">Per week</option><option value="monthly">Per month</option></select></label>' +
            f("cfRate", "Pay amount (₦) for that period", v.rate_kobo / 100, "number", 'min="0" step="100"') +
            f("cfWdw", "Working days in a week (for weekly pay)", v.work_days_per_week, "number", 'min="1" max="7"') + f("cfWdm", "Working days in a month (for monthly pay)", v.work_days_per_month, "number", 'min="1" max="31"') +
            f("cfTs", "Target: student registrations", v.target_student_regs, "number", 'min="0"') + f("cfTv", "Target: verified referrals", v.target_verified, "number", 'min="0"') +
            f("cfTb", "Target: business registrations", v.target_business_regs, "number", 'min="0"') + f("cfTa", "Target: active members", v.target_active_members, "number", 'min="0"') +
            f("cfBonus", "Bonus per verified referral (₦, 0 for none)", v.bonus_per_verified_kobo / 100, "number", 'min="0" step="50"') + f("cfBt", "Bonus starts after this many verified referrals", v.bonus_threshold, "number", 'min="0"') +
            "</div>" +
            '<label class="meta">Instructions for the team<textarea id="cfInstr" rows="4" maxlength="4000" style="width:100%;">' + esc(v.instructions || "") + "</textarea></label>" +
            '<button type="button" class="contact-btn" id="cfSave">Save campaign</button> <button type="button" class="btn btn-outline" id="cfCancel">Cancel</button><p id="cfMsg" class="msg"></p></div>';
        el("cfBasis").value = v.pay_basis;
        el("cfCancel").addEventListener("click", function () { el("campForm").style.display = "none"; });
        el("cfSave").addEventListener("click", async function () {
            const n = function (id) { return parseInt(el(id).value, 10) || 0; };
            const r = await rpc("mkt_campaign_save", {
                p_id: c ? c.id : null, p_inst: c ? c.institution_id : el("cfInst").value, p_name: el("cfName").value, p_instructions: el("cfInstr").value,
                p_start: el("cfStart").value, p_end: el("cfEnd").value, p_basis: el("cfBasis").value, p_rate_kobo: M.toKobo(el("cfRate").value),
                p_wdw: n("cfWdw"), p_wdm: n("cfWdm"), p_t_students: n("cfTs"), p_t_verified: n("cfTv"), p_t_business: n("cfTb"), p_t_active: n("cfTa"),
                p_bonus_kobo: M.toKobo(el("cfBonus").value) || 0, p_bonus_threshold: n("cfBt")
            });
            if (r.error) { err("cfMsg", r.error); return; }
            el("campForm").style.display = "none";
            await loadCampaigns();
            openCampaign(r.data);
        });
    }
    el("campNew").addEventListener("click", function () { campForm(null); });

    async function openCampaign(id) {
        const box = el("campDetail");
        box.innerHTML = '<p class="meta">Loading...</p>';
        const r = await rpc("mkt_campaign_get", { p_id: id });
        if (r.error) { box.innerHTML = '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>"; return; }
        const d = r.data, c = d.campaign;
        curCampaign = d;
        const sum = function (k) { return d.people.reduce(function (a, p) { return a + (p[k] || 0); }, 0); };
        const live = c.status === "active" || c.status === "completed";
        const tr = await rpc("mkt_team_get", { p_inst: c.institution_id });
        const unassigned = tr.error ? [] : tr.data.members.filter(function (m) { return m.status === "active" && !d.people.some(function (p) { return p.member_id === m.id && p.status === "active"; }); });
        box.innerHTML = '<div class="panel" style="margin-top:14px;"><h3 style="margin:0 0 4px;">' + esc(c.name) + ' <span class="badge ' + (c.status === "active" ? "on" : "") + '">' + esc(c.status) + "</span></h3>" +
            '<p class="meta">' + esc(c.institution) + " - " + esc(M.fdate(c.start_date)) + " to " + esc(M.fdate(c.end_date)) + " - pay " + esc(c.pay_basis) + " " + M.naira(c.rate_kobo) + (c.bonus_per_verified_kobo ? " - bonus " + M.naira(c.bonus_per_verified_kobo) + " per verified referral after " + c.bonus_threshold : "") + "</p>" +
            (c.instructions ? "<p>" + esc(c.instructions).replace(/\n/g, "<br>") + "</p>" : "") +
            '<div class="row2"><div><strong>Students</strong>' + M.bar(sum("student_regs"), c.target_student_regs) + "</div><div><strong>Verified referrals</strong>" + M.bar(sum("verified"), c.target_verified) + "</div><div><strong>Businesses</strong>" + M.bar(sum("business_regs"), c.target_business_regs) + "</div><div><strong>Active members</strong>" + M.bar(sum("active_members"), c.target_active_members) + "</div></div>" +
            '<div class="filters" style="margin-top:10px;">' +
            (c.status === "draft" ? '<button type="button" class="btn btn-primary" data-cs="active">Start campaign</button>' : "") +
            (c.status === "active" ? '<button type="button" class="btn btn-primary" data-cs="completed">Mark completed</button>' : "") +
            (c.status === "draft" || c.status === "active" ? '<button type="button" class="btn btn-outline" data-cs="cancelled">Cancel campaign</button><button type="button" class="btn btn-outline" id="cdEdit">Edit</button>' : "") +
            "</div><p id=\"cdMsg\" class=\"msg\"></p>" +
            '<h4 style="margin:14px 0 6px;">People on this campaign</h4><div class="scroll"><table class="t"><tr><th>Name</th><th>Role</th><th>Days present</th><th>Reports</th><th>Students</th><th>Businesses</th><th>Verified</th><th>Active</th><th>Own pay</th><th></th></tr>' +
            d.people.map(function (p) {
                return "<tr><td>" + esc(p.name) + (p.status === "removed" ? '<span class="badge">removed</span>' : "") + "</td><td>" + esc(p.role_title) + "</td><td>" + p.days_present + "</td><td>" + p.reports_approved + " ok" + (p.reports_waiting ? ", " + p.reports_waiting + " waiting" : "") + "</td><td>" + p.student_regs + "</td><td>" + p.business_regs + "</td><td>" + p.verified + "</td><td>" + p.active_members + "</td><td>" + (p.rate_kobo ? M.naira(p.rate_kobo) : "campaign rate") + "</td><td>" + (p.status === "active" && c.status !== "completed" && c.status !== "cancelled" ? '<button type="button" class="btn btn-outline" data-un="' + esc(p.member_id) + '" style="padding:2px 8px;">Remove</button>' : "") + "</td></tr>";
            }).join("") + "</table></div>" +
            (c.status === "draft" || c.status === "active" ? '<div class="filters" style="margin-top:8px;"><select id="asMember"><option value="">Add a person...</option>' + unassigned.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.name) + " - " + esc(m.role_title) + "</option>"; }).join("") + '</select><input type="number" id="asRate" min="0" step="100" placeholder="Own pay ₦ (optional)" style="width:170px;"><button type="button" class="btn btn-outline" id="asAdd">Add</button><button type="button" class="btn btn-outline" id="asAll">Add the whole team</button></div>' : "") +
            (live ? '<div id="cdAtt"></div><div id="cdRep"></div><div id="cdPay"></div>' : '<p class="meta">Attendance, reports and pay open when the campaign starts.</p>') + "</div>";
        const refresh = function () { openCampaign(id); };
        if (live) {
            M.attendancePanel(el("cdAtt"), c, refresh);
            M.reportsPanel(el("cdRep"), c, refresh);
            payPanel(el("cdPay"), d, refresh);
        }
        box.onclick = async function (e) {
            let q;
            const cs = e.target.closest("[data-cs]");
            if (cs) {
                const s = cs.getAttribute("data-cs");
                if (s !== "active" && !window.confirm("Are you sure? You cannot undo this.")) return;
                q = await rpc("mkt_campaign_set_status", { p_id: id, p_status: s });
            }
            if (e.target.id === "cdEdit") { campForm(Object.assign({ id: id, institution_id: c.institution_id }, c)); return; }
            const un = e.target.closest("[data-un]");
            if (un) q = await rpc("mkt_unassign", { p_campaign: id, p_member: un.getAttribute("data-un") });
            if (e.target.id === "asAdd") {
                const mem = el("asMember").value;
                if (!mem) return;
                q = await rpc("mkt_assign", { p_campaign: id, p_member: mem, p_rate_kobo: el("asRate").value ? M.toKobo(el("asRate").value) : null });
            }
            if (e.target.id === "asAll") {
                q = await rpc("mkt_assign_team", { p_campaign: id });
                if (!q.error) { await loadCampaigns(); await openCampaign(id); M.say("cdMsg", q.data.assigned + " added, " + q.data.skipped + " skipped (already in another campaign on those dates).", true); return; }
            }
            if (!q) return;
            if (q.error) { err("cdMsg", q.error); return; }
            await loadCampaigns();
            openCampaign(id);
        };
    }

    // ---------- Pay ----------
    async function payPanel(box, d, refresh) {
        const c = d.campaign;
        const t = M.todayLagos();
        const to = c.end_date < t ? c.end_date : t;
        box.innerHTML = '<h4 style="margin:14px 0 6px;">Pay</h4>' +
            '<p class="meta">Pay is worked out by the database from days marked present and real referrals. Prepare it, then Finance (or the Super Admin, someone other than the person who prepared it) approves, then marks it paid after sending the money. Approved days cannot be changed.</p>' +
            '<div class="row2"><div class="stat"><b>' + M.naira(d.money.prepared_kobo) + '</b><span class="meta">Prepared</span></div><div class="stat"><b>' + M.naira(d.money.approved_kobo) + '</b><span class="meta">Approved, not paid</span></div><div class="stat"><b>' + M.naira(d.money.paid_kobo) + '</b><span class="meta">Paid</span></div><div class="stat"><b>' + M.naira(d.money.withheld_kobo) + '</b><span class="meta">Withheld</span></div></div>' +
            '<div class="filters" style="margin-top:8px;"><label class="meta">From <input type="date" id="pyFrom" min="' + esc(c.start_date) + '" max="' + esc(to) + '" value="' + esc(c.start_date) + '"></label><label class="meta">To <input type="date" id="pyTo" min="' + esc(c.start_date) + '" max="' + esc(to) + '" value="' + esc(to) + '"></label><button type="button" class="btn btn-outline" id="pyPrep">Prepare pay for these dates</button></div>' +
            '<div id="pyList"><p class="meta">Loading...</p></div><p id="pyMsg" class="msg"></p>';
        const r = await rpc("mkt_pay_list", { p_campaign: c.id });
        if (r.error) { el("pyList").innerHTML = '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>"; return; }
        const rows = r.data || [];
        el("pyList").innerHTML = rows.length ? '<div class="scroll"><table class="t"><tr>' + (canFinance ? "<th></th>" : "") + "<th>Name</th><th>Period</th><th>Days</th><th>Base</th><th>Bonus</th><th>Manual bonus</th><th>Total</th><th>Status</th>" + (canFinance ? "<th>Bank</th>" : "") + "<th></th></tr>" + rows.map(function (p) {
            const acts = [];
            if (p.status === "prepared") acts.push('<button type="button" class="btn btn-outline" data-bonus="' + esc(p.id) + '" style="padding:2px 8px;">Bonus</button>');
            if (canFinance && p.status === "approved") acts.push('<button type="button" class="btn btn-primary" data-paid="' + esc(p.id) + '" style="padding:2px 8px;">Mark paid</button>');
            if (canFinance && (p.status === "prepared" || p.status === "approved")) acts.push('<button type="button" class="btn btn-outline" data-hold="' + esc(p.id) + '" style="padding:2px 8px;">Withhold</button>');
            if (canFinance && p.status === "withheld") acts.push('<button type="button" class="btn btn-outline" data-release="' + esc(p.id) + '" style="padding:2px 8px;">Release</button>');
            return "<tr>" + (canFinance ? '<td>' + (p.status === "prepared" ? '<input type="checkbox" data-pick="' + esc(p.id) + '">' : "") + "</td>" : "") + "<td>" + esc(p.name) + '<br><span class="meta">' + esc(p.role_title) + "</span></td><td>" + esc(M.fdate(p.period_start)) + " - " + esc(M.fdate(p.period_end)) + "</td><td>" + p.days_present + "</td><td>" + M.naira(p.base_kobo) + "</td><td>" + M.naira(p.bonus_kobo) + "</td><td>" + M.naira(p.manual_bonus_kobo) + (p.manual_bonus_reason ? '<br><span class="meta">' + esc(p.manual_bonus_reason) + "</span>" : "") + "</td><td><strong>" + M.naira(p.total_kobo) + "</strong></td><td>" + esc(p.status) + (p.payment_reference ? '<br><span class="meta">ref ' + esc(p.payment_reference) + "</span>" : "") + (p.withheld_reason ? '<br><span class="meta">' + esc(p.withheld_reason) + "</span>" : "") + '<br><span class="meta">prepared by ' + esc(p.prepared_by_name || "-") + (p.approved_by_name ? ", approved by " + esc(p.approved_by_name) : "") + "</span></td>" + (canFinance ? "<td>" + (p.bank_name ? esc(p.bank_name) + "<br>" + esc(p.account_number) + "<br>" + esc(p.account_name) : '<span class="meta">not added yet</span>') + "</td>" : "") + "<td>" + acts.join(" ") + "</td></tr>";
        }).join("") + "</table></div>" + (canFinance ? '<button type="button" class="contact-btn" id="pyApprove">Approve the ticked records</button>' : '<p class="meta">Approving and paying needs the Finance permission.</p>') : '<p class="meta">No pay records yet.</p>';

        box.onclick = async function (e) {
            let q;
            if (e.target.id === "pyPrep") {
                q = await rpc("mkt_pay_prepare", { p_campaign: c.id, p_from: el("pyFrom").value, p_to: el("pyTo").value });
                if (!q.error) { M.say("pyMsg", q.data.created + " prepared, " + q.data.updated + " updated, " + q.data.skipped + " skipped (nothing to pay, or already in another period).", true); await sleepRefresh(); return; }
            }
            const b = e.target.closest("[data-bonus]");
            if (b) {
                const amt = window.prompt("Manual bonus in naira (0 to remove it):");
                if (amt === null) return;
                const why = parseFloat(amt) > 0 ? window.prompt("Reason for the bonus:") : "";
                if (parseFloat(amt) > 0 && !why) return;
                q = await rpc("mkt_pay_bonus", { p_id: b.getAttribute("data-bonus"), p_amount_kobo: M.toKobo(amt), p_reason: why });
            }
            if (e.target.id === "pyApprove") {
                const ids = Array.prototype.map.call(box.querySelectorAll("[data-pick]:checked"), function (x) { return x.getAttribute("data-pick"); });
                if (!ids.length) { M.say("pyMsg", "Tick the records to approve."); return; }
                if (!window.confirm("Approve " + ids.length + " record(s)?")) return;
                q = await rpc("mkt_pay_approve", { p_ids: ids });
                if (!q.error) { M.say("pyMsg", q.data + " approved.", true); await sleepRefresh(); return; }
            }
            const pd = e.target.closest("[data-paid]");
            if (pd) {
                const ref = window.prompt("Transfer reference (what the bank gave you after sending the money):");
                if (!ref) return;
                q = await rpc("mkt_pay_mark_paid", { p_id: pd.getAttribute("data-paid"), p_reference: ref });
            }
            const hd = e.target.closest("[data-hold]");
            if (hd) { const why = window.prompt("Why is this pay withheld?"); if (!why) return; q = await rpc("mkt_pay_withhold", { p_id: hd.getAttribute("data-hold"), p_reason: why }); }
            const rl = e.target.closest("[data-release]");
            if (rl) q = await rpc("mkt_pay_release", { p_id: rl.getAttribute("data-release") });
            if (!q) return;
            if (q.error) { err("pyMsg", q.error); return; }
            refresh();
        };
        function sleepRefresh() { return new Promise(function (ok) { setTimeout(function () { refresh(); ok(); }, 900); }); }
    }

    // ---------- Settings (Super Admin) ----------
    async function loadSettings() {
        const box = el("setBox");
        if (!isSuper) { box.innerHTML = '<p class="meta">Only the Super Admin can change these.</p>'; return; }
        const [a, b] = await Promise.all([rpc("mkt_settings_get"), rpc("mkt_roles_list")]);
        if (a.error || b.error) { box.innerHTML = '<p class="msg error">' + esc(M.friendly(a.error || b.error)) + "</p>"; return; }
        settings = a.data; roles = b.data || [];
        box.innerHTML = '<h3 style="margin-top:0;">Defaults for new campaigns</h3><div class="row2"><label class="meta">Pay per working day (₦)<input type="number" id="stRate" min="0" step="100" value="' + settings.default_rate_kobo / 100 + '"></label><label class="meta">Campaign length (days)<input type="number" id="stDays" min="1" max="366" value="' + settings.default_days + '"></label></div><button type="button" class="contact-btn" id="stSave">Save defaults</button>' +
            '<h3>Team template for each NEW institution</h3><p class="meta">Changing a place count here affects institutions you add later. To change an existing team, use the Team tab.</p>' +
            roles.map(function (x) { return '<div class="business-card"><strong>' + esc(x.title) + '</strong><div class="filters"><label class="meta">Places <input type="number" min="0" max="100" value="' + x.default_slots + '" data-tslots="' + esc(x.key) + '" style="width:80px;"></label></div><textarea data-tresp="' + esc(x.key) + '" rows="2" maxlength="600" style="width:100%;">' + esc(x.responsibilities) + '</textarea><button type="button" class="btn btn-outline" data-tsave="' + esc(x.key) + '" style="padding:4px 10px;">Save</button></div>'; }).join("") + '<p id="stMsg" class="msg"></p>';
        el("stSave").onclick = async function () {
            const r = await rpc("mkt_settings_set", { p_rate_kobo: M.toKobo(el("stRate").value), p_days: parseInt(el("stDays").value, 10) });
            if (r.error) err("stMsg", r.error); else { M.say("stMsg", "Saved.", true); settings = null; loadSettings(); }
        };
        box.onclick = async function (e) {
            const b2 = e.target.closest("[data-tsave]");
            if (!b2) return;
            const k = b2.getAttribute("data-tsave");
            const r = await rpc("mkt_role_template_set", { p_key: k, p_slots: parseInt(document.querySelector('[data-tslots="' + k + '"]').value, 10), p_resp: document.querySelector('[data-tresp="' + k + '"]').value });
            if (r.error) err("stMsg", r.error); else M.say("stMsg", "Saved.", true);
        };
    }

    // ---------- Start ----------
    async function init() {
        const s = await db.auth.getSession();
        if (!s.data.session) { location.href = "auth.html?next=marketing-admin.html"; return; }
        const a = await db.rpc("my_admin_access");
        const row = a.data && a.data[0];
        isSuper = !!(row && row.is_super);
        const perms = (row && row.permissions) || [];
        canFinance = isSuper || perms.indexOf("finance") !== -1;
        if (!isSuper && !(row && row.status === "active" && perms.indexOf("marketing") !== -1)) {
            M.say("pgMsg", "This page is only for the Super Admin and administrators with the Marketing permission.");
            return;
        }
        el("app").style.display = "";
        el("tabSet").style.display = isSuper ? "" : "none";
        document.querySelectorAll("#tabs [data-tab]").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
        const st = await rpc("mkt_settings_get");
        if (!st.error) settings = st.data;
        await loadInstitutions();
        showTab("dash");
    }
    init();
})();
