// LBN Phase 17: University Marketing Department. Small helpers shared by marketing-admin.html and marketing.html.
// Works with supabase-marketing.sql. All money is worked out by the database; this file only shows it.
window.MKT = (function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function naira(kobo) {
        if (kobo === null || kobo === undefined) return "-";
        return "₦" + (Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    function toKobo(n) { const v = Math.round(parseFloat(n) * 100); return isNaN(v) ? null : v; }
    function todayLagos() { return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }); }
    function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function fdate(iso) { if (!iso) return ""; return new Date(String(iso).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
    function say(id, text, ok) { const m = el(id); if (!m) return; m.textContent = text || ""; m.className = "msg" + (text ? (ok ? " ok" : " error") : ""); }
    function friendly(e) {
        const t = (e && e.message) || "Something went wrong";
        if (/Could not find the function|does not exist/i.test(t)) return "The marketing database file has not been run yet (supabase-marketing.sql).";
        return t;
    }
    async function rpc(fn, args) {
        const r = await db.rpc(fn, args || {});
        return r;
    }
    function bar(now, target) {
        if (!target) return '<span class="meta">' + now + '</span>';
        const pct = Math.min(100, Math.round((now / target) * 100));
        return '<div style="background:var(--border,#243049);border-radius:6px;height:8px;overflow:hidden;margin:4px 0;"><div style="width:' + pct + '%;height:8px;background:var(--accent,#20d49b);"></div></div><span class="meta">' + now + " of " + target + " (" + pct + "%)</span>";
    }
    const KINDS = { outreach: "Outreach", registration_drive: "Registration drive", business_visit: "Business visit", event: "Event or activation", digital_post: "Digital post", other: "Other" };

    // ---------- Attendance (used by admins and coordinators) ----------
    async function attendancePanel(box, campaign, onChange) {
        const t = todayLagos();
        const max = campaign.end_date < t ? campaign.end_date : t;
        const day = box.getAttribute("data-day") || max;
        box.innerHTML = '<h4 style="margin:10px 0 6px;">Attendance</h4><div class="filters"><input type="date" id="attDay" min="' + esc(campaign.start_date) + '" max="' + esc(max) + '" value="' + esc(day) + '"></div><div id="attList"><p class="meta">Loading...</p></div><p id="attMsg" class="msg"></p>';
        async function load() {
            const d = el("attDay").value;
            box.setAttribute("data-day", d);
            const r = await rpc("mkt_attendance_list", { p_campaign: campaign.id, p_day: d });
            if (r.error) { el("attList").innerHTML = '<p class="msg error">' + esc(friendly(r.error)) + "</p>"; return; }
            const rows = r.data || [];
            el("attList").innerHTML = rows.length ? rows.map(function (p) {
                const st = p.status;
                function b(s, label) { return '<button type="button" class="btn ' + (st === s ? "btn-primary" : "btn-outline") + '" data-att="' + esc(p.member_id) + '" data-s="' + s + '" style="padding:4px 10px;">' + label + "</button> "; }
                return '<div class="business-card"><strong>' + esc(p.name) + '</strong> <span class="meta">' + esc(p.role_title) + " - " + p.reports + " report(s) that day</span><div style=\"margin-top:6px;\">" + b("present", "Present") + b("absent", "Absent") + b("excused", "Excused") + "</div></div>";
            }).join("") : '<p class="meta">Nobody is assigned yet.</p>';
        }
        box.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-att]");
            if (!b) return;
            const r = await rpc("mkt_attendance_mark", { p_campaign: campaign.id, p_member: b.getAttribute("data-att"), p_day: el("attDay").value, p_status: b.getAttribute("data-s") });
            if (r.error) { say("attMsg", friendly(r.error)); return; }
            say("attMsg", "");
            await load();
            if (onChange) onChange();
        });
        el("attDay").addEventListener("change", load);
        await load();
    }

    // ---------- Daily reports review ----------
    async function reportsPanel(box, campaign, onChange) {
        box.innerHTML = '<h4 style="margin:14px 0 6px;">Daily reports</h4><div class="filters"><select id="repFilter"><option value="submitted">Waiting for review</option><option value="">All</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div><div id="repList"><p class="meta">Loading...</p></div><p id="repMsg" class="msg"></p>';
        async function load() {
            const f = el("repFilter").value;
            const r = await rpc("mkt_activity_list", { p_campaign: campaign.id, p_status: f || null });
            if (r.error) { el("repList").innerHTML = '<p class="msg error">' + esc(friendly(r.error)) + "</p>"; return; }
            const rows = r.data || [];
            el("repList").innerHTML = rows.length ? rows.map(function (z) {
                return '<div class="business-card"><strong>' + esc(z.name) + '</strong> - ' + esc(KINDS[z.kind] || z.kind) + ' <span class="meta">' + esc(fdate(z.day)) + " - " + esc(z.status) + '</span><p style="margin:6px 0;">' + esc(z.summary) + '</p><p class="meta">People reached: ' + z.contacts + " - students they say they signed up: " + z.student_regs_claimed + " - businesses: " + z.business_regs_claimed + (z.evidence_note ? " - proof: " + esc(z.evidence_note) : "") + (z.review_note ? " - note: " + esc(z.review_note) : "") + "</p>" +
                    (z.status === "submitted" ? '<button type="button" class="btn btn-primary" data-rv="' + esc(z.id) + '" data-ok="1" style="padding:4px 10px;">Approve</button> <button type="button" class="btn btn-outline" data-rv="' + esc(z.id) + '" data-ok="0" style="padding:4px 10px;">Reject</button>' : "") + "</div>";
            }).join("") : '<p class="meta">No reports here.</p>';
        }
        box.addEventListener("click", async function (e) {
            const b = e.target.closest("[data-rv]");
            if (!b) return;
            const ok = b.getAttribute("data-ok") === "1";
            let note = null;
            if (!ok) { note = window.prompt("Why is this report rejected?"); if (!note) return; }
            const r = await rpc("mkt_activity_review", { p_id: b.getAttribute("data-rv"), p_approve: ok, p_note: note });
            if (r.error) { say("repMsg", friendly(r.error)); return; }
            say("repMsg", "");
            await load();
            if (onChange) onChange();
        });
        el("repFilter").addEventListener("change", load);
        await load();
    }

    return { el: el, esc: esc, naira: naira, toKobo: toKobo, todayLagos: todayLagos, addDays: addDays, fdate: fdate, say: say, friendly: friendly, rpc: rpc, bar: bar, KINDS: KINDS, attendancePanel: attendancePanel, reportsPanel: reportsPanel };
})();
