// LBN Phase 17C: "My marketing work" for campus coordinators and promoters. Works with supabase-marketing.sql and marketing-common.js.
// Everything here is limited by the database to the signed-in person's own team and own work.
(function () {
    const M = window.MKT;
    const el = M.el, esc = M.esc, rpc = M.rpc;
    const SITE = "https://odi-king.github.io/Lagos-business-network/";
    let ctx = null, work = null;

    function section(title, inner) { return '<section class="panel"><h3 style="margin-top:0;">' + title + "</h3>" + inner + "</section>"; }

    function myCampaigns() {
        if (!work.campaigns.length) return '<p class="meta">You are not assigned to a campaign right now. Your team is on standby. You will get a notification when a campaign starts.</p>';
        return work.campaigns.map(function (c) {
            const kindOpts = Object.keys(M.KINDS).map(function (k) { return '<option value="' + k + '">' + esc(M.KINDS[k]) + "</option>"; }).join("");
            const today = M.todayLagos();
            const maxDay = c.end_date < today ? c.end_date : today;
            const minDay = M.addDays(today, -3) > c.start_date ? M.addDays(today, -3) : c.start_date;
            return '<div class="business-card" data-camp="' + esc(c.campaign_id) + '"><h4 style="margin:0 0 4px;">' + esc(c.name) + ' <span class="badge ' + (c.status === "active" ? "on" : "") + '">' + esc(c.status) + "</span></h4>" +
                '<p class="meta">' + esc(c.role_title) + " - " + esc(M.fdate(c.start_date)) + " to " + esc(M.fdate(c.end_date)) + "</p>" +
                (c.instructions ? "<p>" + esc(c.instructions).replace(/\n/g, "<br>") + "</p>" : "") +
                '<div class="row2"><div class="stat"><b>' + c.days_present + '</b><span class="meta">Days marked present</span></div><div class="stat"><b>' + c.student_regs + '</b><span class="meta">Students signed up through your link</span></div><div class="stat"><b>' + c.business_regs + '</b><span class="meta">Businesses signed up</span></div><div class="stat"><b>' + c.verified + '</b><span class="meta">Verified referrals</span></div><div class="stat"><b>' + c.active_members + '</b><span class="meta">Active members</span></div><div class="stat"><b>' + M.naira(c.earned_so_far_kobo) + '</b><span class="meta">Earned so far (estimate, paid after approval)</span></div></div>' +
                '<p class="meta" style="margin-top:8px;">Team targets for this campaign: students ' + c.target_student_regs + ", verified " + c.target_verified + ", businesses " + c.target_business_regs + ", active members " + c.target_active_members + ". Your pay: " + M.naira(c.my_rate_kobo) + " per " + (c.pay_basis === "daily" ? "working day" : c.pay_basis === "weekly" ? "week" : "month") + ".</p>" +
                (c.status === "active" ? '<h4 style="margin:12px 0 6px;">Send today\'s report</h4><div class="row2">' +
                    '<label class="meta">Day<input type="date" data-f="day" min="' + esc(minDay) + '" max="' + esc(maxDay) + '" value="' + esc(maxDay) + '"></label>' +
                    '<label class="meta">What kind of work<select data-f="kind">' + kindOpts + "</select></label>" +
                    '<label class="meta">People reached<input type="number" data-f="contacts" min="0" max="5000" value="0"></label>' +
                    '<label class="meta">Students you signed up<input type="number" data-f="students" min="0" max="2000" value="0"></label>' +
                    '<label class="meta">Businesses you signed up<input type="number" data-f="business" min="0" max="2000" value="0"></label></div>' +
                    '<textarea data-f="summary" rows="3" maxlength="1000" placeholder="Describe what you did today (at least 10 letters)" style="width:100%;margin-top:8px;"></textarea>' +
                    '<input type="text" data-f="evidence" maxlength="300" placeholder="Proof (optional): a link to a photo, post or note" style="margin-top:6px;">' +
                    '<button type="button" class="contact-btn" data-send="' + esc(c.campaign_id) + '">Send report</button><p class="msg" data-msg></p>' : "") +
                '<div data-reports="' + esc(c.campaign_id) + '"></div></div>';
        }).join("");
    }

    async function loadReports(box, id) {
        const r = await rpc("mkt_my_activity_list", { p_campaign: id });
        const rows = r.data || [];
        box.innerHTML = rows.length ? '<h4 style="margin:12px 0 6px;">My reports</h4>' + rows.map(function (z) {
            return '<p class="meta" style="margin:4px 0;">' + esc(M.fdate(z.day)) + " - " + esc(M.KINDS[z.kind] || z.kind) + " - <strong>" + esc(z.status) + "</strong>" + (z.review_note ? " (" + esc(z.review_note) + ")" : "") + " - " + esc(z.summary.slice(0, 90)) + "</p>";
        }).join("") : "";
    }

    function payBlock() {
        if (!work.pay.length) return '<p class="meta">No pay records yet. Pay is prepared by the marketing office after approved days, then approved by Finance.</p>';
        return '<div class="scroll"><table class="t"><tr><th>Campaign</th><th>Period</th><th>Days</th><th>Base</th><th>Bonus</th><th>Total</th><th>Status</th></tr>' + work.pay.map(function (p) {
            return "<tr><td>" + esc(p.campaign) + "</td><td>" + esc(M.fdate(p.period_start)) + " - " + esc(M.fdate(p.period_end)) + "</td><td>" + p.days_present + "</td><td>" + M.naira(p.base_kobo) + "</td><td>" + M.naira(Number(p.bonus_kobo) + Number(p.manual_bonus_kobo)) + "</td><td><strong>" + M.naira(p.total_kobo) + "</strong></td><td>" + esc(p.status) + (p.payment_reference ? '<br><span class="meta">ref ' + esc(p.payment_reference) + "</span>" : "") + "</td></tr>";
        }).join("") + "</table></div>";
    }

    async function bankBlock() {
        const b = await rpc("mkt_my_bank_get");
        const d = b.data || {};
        return '<p class="meta">Your pay is sent to this account. The account name must match your own name.</p><div class="row2"><input type="text" id="bkBank" placeholder="Bank name" maxlength="60" value="' + esc(d.bank_name || "") + '"><input type="text" id="bkNum" placeholder="Account number (10 digits)" maxlength="10" inputmode="numeric" value="' + esc(d.account_number || "") + '"><input type="text" id="bkName" placeholder="Account name" maxlength="80" value="' + esc(d.account_name || "") + '"></div><button type="button" class="contact-btn" id="bkSave">Save bank details</button><p id="bkMsg" class="msg"></p>';
    }

    // ---------- Coordinator: manage own campus ----------
    async function coordBlock(place) {
        const r = await rpc("mkt_campaign_list", { p_inst: place.institution_id });
        if (r.error) return '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>";
        const rows = r.data || [];
        const t = await rpc("mkt_team_get", { p_inst: place.institution_id });
        const team = t.data;
        return '<p class="meta">You manage the ' + esc(place.institution) + ' team. You can mark attendance (last 7 days) and review daily reports. The marketing office handles people, campaigns and pay.</p>' +
            (team ? '<h4 style="margin:8px 0 6px;">My team (' + team.members.length + ")</h4>" + team.members.map(function (m) { return '<p class="meta" style="margin:2px 0;">' + esc(m.name) + " - " + esc(m.role_title) + (m.status !== "active" ? " (" + esc(m.status) + ")" : "") + (m.on_campaign ? " - on a campaign" : " - standby") + "</p>"; }).join("") : "") +
            '<h4 style="margin:14px 0 6px;">Campaigns</h4>' + (rows.length ? rows.map(function (c) {
                return '<div class="business-card"><strong>' + esc(c.name) + '</strong> <span class="badge ' + (c.status === "active" ? "on" : "") + '">' + esc(c.status) + '</span><p class="meta">' + esc(M.fdate(c.start_date)) + " - " + esc(M.fdate(c.end_date)) + " - " + c.people + " people - students " + c.student_regs + (c.target_student_regs ? "/" + c.target_student_regs : "") + ", businesses " + c.business_regs + (c.target_business_regs ? "/" + c.target_business_regs : "") + ", verified " + c.verified + ", active " + c.active_members + '</p>' + (c.status === "active" || c.status === "completed" ? '<button type="button" class="btn btn-outline" data-manage="' + esc(c.id) + '" style="padding:4px 10px;">Attendance and reports</button>' : "") + "</div>";
            }).join("") : '<p class="meta">No campaigns for your campus yet.</p>') + '<div id="coordWork"></div>';
    }

    async function render() {
        const places = ctx.places || [];
        if (!places.length) {
            el("app").innerHTML = section("Not on a marketing team", '<p class="meta">You are not part of a campus marketing team. If you should be, ask the LBN marketing office.</p>');
            return;
        }
        const w = await rpc("mkt_my_work");
        if (w.error) { M.say("pgMsg", M.friendly(w.error)); return; }
        work = w.data;
        const place = places[0];
        const link = work.referral_code ? SITE + "auth.html?ref=" + encodeURIComponent(work.referral_code) : "";
        let html = '<p class="notice"><strong>' + esc(place.role_title) + "</strong> - " + esc(place.institution) + (place.status !== "active" ? " (" + esc(place.status) + ")" : "") + "</p>";
        if (place.status !== "active") html += '<p class="msg error">Your place is suspended. Please contact the marketing office.</p>';
        html += section("My referral link", link ? '<p class="meta">Students and businesses who join through this link count for you. Share it, or give it out in person.</p><input type="text" id="myLink" readonly value="' + esc(link) + '" style="width:100%;"><button type="button" class="contact-btn" id="copyLink">Copy link</button><p id="linkMsg" class="msg"></p>' : '<p class="meta">Your link will show here once your account has a referral code. Open Invite friends in Settings first.</p>');
        html += section("My campaigns and daily reports", myCampaigns());
        html += section("My pay", payBlock());
        html += section("My bank account", await bankBlock());
        if (place.is_coordinator) html += section("Coordinator: my campus team", await coordBlock(place));
        el("app").innerHTML = html;
        document.querySelectorAll("[data-reports]").forEach(function (b) { loadReports(b, b.getAttribute("data-reports")); });
    }

    el("app").addEventListener("click", async function (e) {
        const t = e.target;
        if (t.id === "copyLink") {
            try { await navigator.clipboard.writeText(el("myLink").value); M.say("linkMsg", "Copied.", true); } catch (x) { el("myLink").select(); M.say("linkMsg", "Select the link and copy it."); }
            return;
        }
        if (t.id === "bkSave") {
            const r = await rpc("mkt_my_bank_set", { p_bank: el("bkBank").value, p_number: el("bkNum").value, p_name: el("bkName").value });
            if (r.error) M.say("bkMsg", M.friendly(r.error)); else M.say("bkMsg", "Saved.", true);
            return;
        }
        const s = t.closest("[data-send]");
        if (s) {
            const card = s.closest("[data-camp]");
            const f = function (n) { return card.querySelector('[data-f="' + n + '"]'); };
            const msg = card.querySelector("[data-msg]");
            const r = await rpc("mkt_my_activity_submit", { p_campaign: s.getAttribute("data-send"), p_day: f("day").value, p_kind: f("kind").value, p_summary: f("summary").value, p_contacts: parseInt(f("contacts").value, 10) || 0, p_students: parseInt(f("students").value, 10) || 0, p_business: parseInt(f("business").value, 10) || 0, p_evidence: f("evidence").value });
            if (r.error) { msg.textContent = M.friendly(r.error); msg.className = "msg error"; return; }
            msg.textContent = "Report sent. Your coordinator will review it."; msg.className = "msg ok";
            f("summary").value = ""; f("evidence").value = "";
            loadReports(card.querySelector("[data-reports]"), s.getAttribute("data-send"));
            return;
        }
        const mg = t.closest("[data-manage]");
        if (mg) {
            const id = mg.getAttribute("data-manage");
            const r = await rpc("mkt_campaign_get", { p_id: id });
            const box = el("coordWork");
            if (r.error) { box.innerHTML = '<p class="msg error">' + esc(M.friendly(r.error)) + "</p>"; return; }
            const c = r.data.campaign;
            box.innerHTML = '<div class="panel" style="margin-top:12px;"><h4 style="margin:0 0 6px;">' + esc(c.name) + '</h4><div class="scroll"><table class="t"><tr><th>Name</th><th>Role</th><th>Days present</th><th>Reports ok</th><th>Waiting</th><th>Students</th><th>Businesses</th><th>Verified</th></tr>' + r.data.people.filter(function (p) { return p.status === "active"; }).map(function (p) {
                return "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.role_title) + "</td><td>" + p.days_present + "</td><td>" + p.reports_approved + "</td><td>" + p.reports_waiting + "</td><td>" + p.student_regs + "</td><td>" + p.business_regs + "</td><td>" + p.verified + "</td></tr>";
            }).join("") + '</table></div><div id="cwAtt"></div><div id="cwRep"></div></div>';
            if (c.status === "active" || c.status === "completed") {
                M.attendancePanel(el("cwAtt"), c, null);
                M.reportsPanel(el("cwRep"), c, null);
            }
            box.scrollIntoView({ behavior: "smooth" });
        }
    });

    async function init() {
        const s = await db.auth.getSession();
        if (!s.data.session) { location.href = "auth.html?next=marketing.html"; return; }
        const r = await rpc("mkt_my_context");
        if (r.error) { M.say("pgMsg", M.friendly(r.error)); return; }
        ctx = r.data;
        render();
    }
    init();
})();
