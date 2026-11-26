// LBN Phase 11D: a member applies to be an International Representative, sees their countries and sends monthly reports.
// Works with supabase-representatives.sql.

(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function say(id, t, ok) { const m = el(id); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }

    const codeOf = window.lbnSetupLocation({ country: "country", state: "stateBox", countryList: "countryList", stateList: "stateList" });
    const LABEL = { submitted: "Waiting for review", reviewing: "Being reviewed", interview: "The LBN team will contact you for a conversation", approved: "Approved", rejected: "Not approved", withdrawn: "Withdrawn" };

    async function load() {
        const { data: sess } = await db.auth.getSession();
        if (!sess.session) { location.href = "auth.html?next=representative.html"; return; }

        const { data, error } = await db.rpc("rep_my_status");
        if (error || !data) { el("statusPanel").innerHTML = "<p class='meta'>This programme is not set up yet. (The LBN team still needs to run supabase-representatives.sql.)</p>"; return; }

        const rep = data.rep;
        const app = data.application;
        const open = app && ["submitted", "reviewing", "interview"].indexOf(app.status) >= 0;
        let html = "";

        if (rep && rep.status === "active") {
            html = "<h2>You are an LBN International Representative</h2><p>Your countries: <strong>" + (data.assignments.length ? data.assignments.map(function (a) { return esc(a.country); }).join(", ") : "none yet - the LBN team will assign one") + "</strong></p>";
        } else if (rep) {
            html = "<h2>Your Representative status: " + esc(rep.status) + "</h2><p class='meta'>Please contact LBN support.</p>";
        } else if (app && app.status !== "withdrawn") {
            html = "<h2>Your application for " + esc(app.country) + "</h2><p><strong>" + esc(LABEL[app.status] || app.status) + "</strong></p>" + (app.note ? "<p class='meta'>" + esc(app.note) + "</p>" : "") +
                (open ? "<button type='button' class='btn btn-outline' id='withdrawBtn'>Withdraw my application</button>" : "");
        } else {
            html = "<h2>Become a Representative</h2><p class='meta'>Fill in the form below. The LBN team reads every application.</p>";
        }

        el("statusPanel").innerHTML = html;
        el("applyPanel").style.display = (!rep && !open) ? "" : "none";
        el("reportPanel").style.display = rep && rep.status === "active" && data.assignments.length ? "" : "none";

        const w = el("withdrawBtn");
        if (w) w.addEventListener("click", async function () { await db.rpc("rep_withdraw_application"); load(); });

        el("rCountry").innerHTML = data.assignments.map(function (a) { return "<option value='" + esc(a.code) + "'>" + esc(a.country) + "</option>"; }).join("");

        el("reportList").innerHTML = data.reports.length ? "<h3>My reports</h3>" + data.reports.map(function (r) {
            return "<div class='business-card'><strong>" + esc(r.period) + "</strong> - " + esc(r.country_code) + (r.rating ? " - rated " + r.rating + "/5" : " - waiting for review") +
                "<p class='meta'>" + esc(r.summary) + "</p>" + (r.note ? "<p class='meta'>Team note: " + esc(r.note) + "</p>" : "") + "</div>";
        }).join("") : "";
    }

    el("repForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const code = codeOf();
        if (!code) { say("applyMsg", "Choose the country from the list.", false); return; }
        const { data, error } = await db.rpc("rep_apply", { p_code: code, p_country: el("country").value.trim(), p_city: el("city").value, p_languages: el("languages").value, p_experience: el("experience").value, p_motivation: el("motivation").value });
        if (error || !data || data.ok === false) { say("applyMsg", error ? error.message : (data && data.message) || "Could not send", false); return; }
        say("applyMsg", "Application sent. We will tell you what we decide.", true);
        load();
    });

    el("reportForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const { data, error } = await db.rpc("rep_submit_report", { p_code: el("rCountry").value, p_period: el("rPeriod").value, p_businesses: parseInt(el("rBiz").value || "0", 10), p_members: parseInt(el("rMem").value || "0", 10), p_events: parseInt(el("rEvents").value || "0", 10), p_summary: el("rSummary").value });
        if (error || !data || data.ok === false) { say("reportMsg", error ? error.message : (data && data.message) || "Could not send", false); return; }
        say("reportMsg", "Report sent. Thank you.", true);
        load();
    });

    load();
})();