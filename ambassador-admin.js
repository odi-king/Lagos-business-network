function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

var logoutLink = document.getElementById("logoutBtn");
if (logoutLink) {
    logoutLink.addEventListener("click", async function (event) {
        event.preventDefault();
        if (db) await db.auth.signOut();
        window.location.href = "auth.html";
    });
}

const msg = document.getElementById("ambMsg");

function say(text, kind) {
    msg.textContent = text || "";
    msg.className = "msg " + (kind || "");
}

const TYPE = { business: "Business Owner", student: "Student", lecturer: "Lecturer" };
const RANK = { school: "School Ambassador", senior: "Senior Ambassador", regional_manager: "Regional Ambassador Manager", national_director: "National Ambassador Director" };
let schoolsCache = [];

function naira(kobo) {
    return "\u20A6" + (Number(kobo || 0) / 100).toLocaleString();
}

function d(value) {
    return value ? new Date(value).toLocaleDateString() : "";
}

function showTab(name) {
    ["applications", "appointments", "schools", "payments"].forEach(function (t) {
        document.getElementById("tab-" + t).style.display = t === name ? "" : "none";
    });
    document.querySelectorAll(".amb-tab").forEach(function (b) {
        b.classList.toggle("active", b.dataset.tab === name);
    });
    if (name === "applications") loadApplications();
    if (name === "appointments") loadAppointments();
    if (name === "schools") loadSchools();
    if (name === "payments") loadPayments();
}

document.getElementById("ambTabs").addEventListener("click", function (event) {
    const b = event.target.closest(".amb-tab");
    if (b) showTab(b.dataset.tab);
});

function fail(error) {
    say(error.message === "Not allowed" ? "You do not have permission to open this dashboard." : error.message, "error");
}

async function loadApplications() {
    const box = document.getElementById("appList");
    const { data, error } = await db.rpc("admin_ambassador_applications", { p_status: document.getElementById("appFilter").value });

    if (error) { box.innerHTML = ""; fail(error); return; }

    if (schoolsCache.length === 0) {
        const s = await db.rpc("admin_ambassador_schools");
        schoolsCache = s.data || [];
    }

    const options = schoolsCache.filter(function (s) { return s.active; }).map(function (s) {
        return '<option value="' + escapeHTML(s.id) + '">' + escapeHTML(s.name) + "</option>";
    }).join("");

    box.innerHTML = data.length === 0 ? "<p class='meta'>Nothing here.</p>" : data.map(function (a) {
        const open = a.status === "submitted" || a.status === "reviewing";
        const school = '<select class="app-school">' +
            options.replace('value="' + a.school_id + '"', 'value="' + a.school_id + '" selected') + "</select>";

        return '<div class="staff-card" data-app="' + escapeHTML(a.id) + '">' +
            "<strong>" + escapeHTML(a.full_name) + "</strong> <span class='meta'>" + escapeHTML(TYPE[a.audience]) + " &bull; " + escapeHTML(a.status) + " &bull; " + d(a.created_at) + "</span>" +
            (a.past_appointments > 0 ? "<p class='meta'>Returning ambassador (" + a.past_appointments + " past appointment" + (a.past_appointments > 1 ? "s" : "") + ")</p>" : "") +
            "<p class='meta'>" + escapeHTML(a.email) + " &bull; WhatsApp " + escapeHTML(a.whatsapp) + " &bull; " + escapeHTML(a.country) + "</p>" +
            "<p><strong>Community:</strong> " + escapeHTML(a.community) + (a.school_name ? " (" + escapeHTML(a.school_name) + ")" : "") + "<br><strong>Course or business:</strong> " + escapeHTML(a.course_or_business) + "</p>" +
            (a.leadership ? "<p><strong>Leadership:</strong> " + escapeHTML(a.leadership) + "</p>" : "") +
            (a.social_links ? "<p><strong>Social links:</strong> " + escapeHTML(a.social_links) + "</p>" : "") +
            (a.whatsapp_groups ? "<p><strong>WhatsApp groups:</strong> " + escapeHTML(a.whatsapp_groups) + "</p>" : "") +
            "<p><strong>Followers:</strong> " + escapeHTML(a.audience_size || "not given") + " &bull; <strong>First month reach:</strong> " + escapeHTML(a.first_month_reach ?? "not given") + "</p>" +
            "<p><strong>Why:</strong> " + escapeHTML(a.why_text) + "</p>" +
            "<p><strong>Referee:</strong> " + escapeHTML(a.referee_name) + " (" + escapeHTML(a.referee_contact) + ")</p>" +
            (a.internal_note || a.internal_score != null ? "<p class='meta'>Internal (never public): score " + escapeHTML(a.internal_score ?? "-") + (a.internal_note ? " &bull; " + escapeHTML(a.internal_note) : "") + "</p>" : "") +
            (open || a.status === "trial" ? '<input type="number" class="app-score" min="0" max="100" placeholder="Score 0-100" value="' + escapeHTML(a.internal_score ?? "") + '">' +
                '<input type="text" class="app-note" maxlength="600" placeholder="Internal note (not shown to the applicant)">' : "") +
            (open ? school : "") +
            '<div class="staff-actions">' +
            (a.status === "submitted" ? '<button type="button" class="btn btn-outline app-act" data-action="review">Mark under review</button>' : "") +
            (open ? '<button type="button" class="btn btn-outline app-act" data-action="start_trial">Approve and start two-week trial</button>' +
                '<button type="button" class="btn btn-outline app-act" data-action="reject">Reject</button>' : "") +
            (a.status === "trial" ? '<button type="button" class="btn btn-outline app-act" data-action="confirm">Confirm after trial</button>' +
                '<button type="button" class="btn btn-outline app-act" data-action="fail_trial">Trial not passed</button>' : "") +
            "</div></div>";
    }).join("");
}

document.getElementById("appFilter").addEventListener("change", loadApplications);

document.getElementById("appList").addEventListener("click", async function (event) {
    const button = event.target.closest(".app-act");
    const card = event.target.closest("[data-app]");
    if (!button || !card) return;

    const action = button.dataset.action;
    const labels = { reject: "Reject this application?", fail_trial: "Mark this trial as not passed?", confirm: "Confirm this ambassador for 12 months?", start_trial: "Approve and start the two-week trial?" };
    if (labels[action] && !confirm(labels[action])) return;

    const score = card.querySelector(".app-score");
    const note = card.querySelector(".app-note");
    const school = card.querySelector(".app-school");
    say("");

    const { error } = await db.rpc("admin_ambassador_decide", {
        p_id: card.dataset.app,
        p_action: action,
        p_school: school && school.value ? school.value : null,
        p_score: score && score.value !== "" ? parseInt(score.value, 10) : null,
        p_note: note ? note.value : null
    });

    if (error) { say(error.message, "error"); return; }
    say("Done.", "ok");
    schoolsCache = [];
    await loadApplications();
});

async function loadAppointments() {
    const box = document.getElementById("ambList");
    const { data, error } = await db.rpc("admin_ambassador_list", { p_status: document.getElementById("ambFilter").value });

    if (error) { box.innerHTML = ""; fail(error); return; }

    box.innerHTML = data.length === 0 ? "<p class='meta'>Nobody here yet.</p>" : data.map(function (a) {
        const live = ["trial", "confirmed", "suspended"].indexOf(a.appointment_status) !== -1;

        return '<div class="staff-card" data-amb="' + escapeHTML(a.id) + '" data-user="' + escapeHTML(a.user_id) + '"><strong>' + escapeHTML(a.full_name || "Member") + "</strong>" +
            '<div class="meta">Type: ' + escapeHTML(TYPE[a.ambassador_type]) + " &bull; Rank: " + escapeHTML(RANK[a.ambassador_rank]) +
            " &bull; Status: " + escapeHTML(a.appointment_status) + " &bull; " + escapeHTML(a.school_name || "No school") +
            (a.appointment_status === "trial" ? " &bull; trial ends " + d(a.trial_end) : "") +
            (a.appointment_end ? " &bull; appointment until " + d(a.appointment_end) : "") +
            (a.certificate_no ? " &bull; certificate " + escapeHTML(a.certificate_no) : "") +
            (a.salary_kobo ? " &bull; salary " + naira(a.salary_kobo) + "/month" : " &bull; salary not approved yet") +
            (a.region ? " &bull; region " + escapeHTML(a.region) : "") +
            (a.last_review ? " &bull; last review " + escapeHTML(a.last_review) : "") +
            (a.renewal_decision ? " &bull; renewal " + escapeHTML(a.renewal_decision) : "") +
            (a.left_at ? " &bull; left " + d(a.left_at) + (a.left_reason ? " (" + escapeHTML(a.left_reason) + ")" : "") : "") + "</div>" +
            '<div class="staff-actions">' +
            (a.appointment_status === "suspended" ? '<button type="button" class="btn btn-outline amb-act" data-action="reinstate">Reinstate</button>' : "") +
            (a.appointment_status === "trial" || a.appointment_status === "confirmed" ? '<button type="button" class="btn btn-outline amb-act" data-action="suspend">Suspend</button>' : "") +
            (live ? '<button type="button" class="btn btn-outline amb-act" data-action="terminate">Terminate</button>' : "") +
            (a.appointment_status === "confirmed" || a.appointment_status === "trial" ? '<button type="button" class="btn btn-outline amb-act" data-action="review">Quarterly review</button>' +
                '<button type="button" class="btn btn-outline amb-act" data-action="warn">Warning</button>' : "") +
            (a.appointment_status === "confirmed" ? '<button type="button" class="btn btn-outline amb-act" data-action="renew">Renew</button>' +
                '<button type="button" class="btn btn-outline amb-act" data-action="decline">Do not renew</button>' : "") +
            (a.appointment_status === "expired" || a.appointment_status === "resigned" ? '<button type="button" class="btn btn-outline amb-act" data-action="renew">Appoint again</button>' : "") +
            '<button type="button" class="btn btn-outline amb-career">Career</button>' +
            '<button type="button" class="btn btn-outline amb-comm">Commissions</button>' +
            '<button type="button" class="btn btn-outline amb-rev">Reviews</button>' +
            '<button type="button" class="btn btn-outline amb-hist">History</button></div>' +
            '<div class="amb-hist-box"></div></div>';
    }).join("");
}

document.getElementById("ambList").addEventListener("click", async function (event) {
    const card = event.target.closest("[data-amb]");
    if (!card) return;

    if (event.target.closest(".amb-hist")) {
        const holder = card.querySelector(".amb-hist-box");
        if (holder.innerHTML) { holder.innerHTML = ""; return; }

        const { data, error } = await db.rpc("admin_ambassador_history", { p_user: card.dataset.user });
        if (error) { say(error.message, "error"); return; }

        holder.innerHTML = data.length === 0 ? "<p class='meta'>No history yet.</p>" : data.map(function (h) {
            return "<p class='meta'>" + escapeHTML(new Date(h.created_at).toLocaleString()) + " &bull; <strong>" + escapeHTML(h.event) + "</strong>" +
                (h.details ? " &bull; " + escapeHTML(h.details) : "") + " &bull; " + escapeHTML(h.actor_name) + "</p>";
        }).join("");
        return;
    }

    if (event.target.closest(".amb-career")) {
        await openCareer(card);
        return;
    }

    const careerBtn = event.target.closest("[data-career]");
    if (careerBtn) {
        await careerAction(card, careerBtn.dataset.career);
        return;
    }

    if (event.target.closest(".amb-comm")) {
        const holder = card.querySelector(".amb-hist-box");
        const { data, error } = await db.rpc("admin_ambassador_commissions", { p_amb: card.dataset.amb });
        if (error) { say(error.message, "error"); return; }
        const label = { hold: "on hold", earned: "earned", review: "being checked", void: "not counted" };
        holder.innerHTML = data.length === 0 ? "<p class='meta'>No commissions yet.</p>" : data.map(function (c) {
            return "<p class='meta'>" + escapeHTML(d(c.created_at)) + " &bull; " + escapeHTML(c.who) + " &bull; " + escapeHTML(label[c.state] || c.state) +
                " &bull; " + naira(c.reward_kobo) + "</p>";
        }).join("");
        return;
    }

    if (event.target.closest(".amb-rev")) {
        const holder = card.querySelector(".amb-hist-box");
        const { data, error } = await db.rpc("admin_ambassador_reviews", { p_amb: card.dataset.amb });
        if (error) { say(error.message, "error"); return; }
        holder.innerHTML = data.length === 0 ? "<p class='meta'>No reviews yet.</p>" : data.map(function (r) {
            return "<p class='meta'><strong>" + escapeHTML(r.period) + "</strong> &bull; " + escapeHTML(r.outcome.replace("_", " ")) +
                (r.score != null ? " &bull; score " + r.score : "") + (r.notes ? " &bull; " + escapeHTML(r.notes) : "") + " &bull; " + escapeHTML(r.reviewer_name) + "</p>";
        }).join("");
        return;
    }

    const button = event.target.closest(".amb-act");
    if (!button) return;

    const action = button.dataset.action;
    let reason = "";

    if (action === "review") {
        const score = prompt("Quarterly review. Score from 0 to 100 (leave empty for no score):", "");
        if (score === null) return;
        const outcome = prompt("Outcome. Type 1 = Satisfactory, 2 = Needs improvement, 3 = Concern:", "1");
        if (outcome === null) return;
        const notes = prompt("Notes (what went well, what to improve):", "");
        if (notes === null) return;
        const map = { "1": "satisfactory", "2": "needs_improvement", "3": "concern" };
        say("");
        const { error } = await db.rpc("admin_ambassador_review_save", {
            p_amb: card.dataset.amb, p_score: score.trim() === "" ? null : parseInt(score, 10),
            p_outcome: map[outcome.trim()] || "satisfactory", p_notes: notes
        });
        if (error) { say(error.message, "error"); return; }
        say("Review saved.", "ok");
        await loadAppointments();
        return;
    }

    if (action === "warn") {
        const why = prompt("Performance warning. What is it about? (the ambassador is notified):", "");
        if (why === null) return;
        say("");
        const { error } = await db.rpc("admin_ambassador_warn", { p_id: card.dataset.amb, p_reason: why });
        if (error) { say(error.message, "error"); return; }
        say("Warning sent.", "ok");
        return;
    }

    if (action === "renew" || action === "decline") {
        const q = action === "renew"
            ? "Renew for a NEW 12-month appointment with a new certificate? Add a note (optional):"
            : "Do NOT renew. The appointment will run to its end date. Add a note (optional):";
        const note = prompt(q, "");
        if (note === null) return;
        say("");
        const { error } = await db.rpc("admin_ambassador_renew", { p_id: card.dataset.amb, p_decision: action, p_note: note });
        if (error) { say(error.message, "error"); return; }
        say(action === "renew" ? "Renewed." : "Recorded.", "ok");
        await loadAppointments();
        return;
    }

    if (action !== "reinstate") {
        reason = prompt((action === "terminate" ? "Terminate this appointment. " : "Suspend this ambassador. ") + "Write the reason (kept in the record):", "");
        if (reason === null) return;
    }

    say("");
    const { error } = await db.rpc("admin_ambassador_action", { p_id: card.dataset.amb, p_action: action, p_reason: reason });
    if (error) { say(error.message, "error"); return; }
    say("Done.", "ok");
    await loadAppointments();
});

document.getElementById("ambFilter").addEventListener("change", loadAppointments);

async function loadSchools() {
    const box = document.getElementById("schoolList");
    const { data, error } = await db.rpc("admin_ambassador_schools");

    if (error) { box.innerHTML = ""; fail(error); return; }
    schoolsCache = data;

    box.innerHTML = data.length === 0 ? "<p class='meta'>Add the first participating school above.</p>" : data.map(function (s) {
        return '<div class="staff-card" data-school="' + escapeHTML(s.id) + '" data-current="' + s.active + '" data-name="' + escapeHTML(s.name) + '" data-country="' + escapeHTML(s.country) + '">' +
            "<strong>" + escapeHTML(s.name) + "</strong> <span class='meta'>" + escapeHTML(s.country) + (s.active ? "" : " &bull; not taking part") + "</span>" +
            "<p>Business Owners " + s.taken_business + "/" + s.cap_business + " &bull; Students " + s.taken_student + "/" + s.cap_student + " &bull; Lecturers " + s.taken_lecturer + "/" + s.cap_lecturer + "</p>" +
            '<p class="meta">Extra places (Super Admin only):</p>' +
            '<input type="number" class="x-b" min="0" value="' + s.extra_business + '" title="Extra Business Owner places"> ' +
            '<input type="number" class="x-s" min="0" value="' + s.extra_student + '" title="Extra Student places"> ' +
            '<input type="number" class="x-l" min="0" value="' + s.extra_lecturer + '" title="Extra Lecturer places">' +
            '<div class="staff-actions"><button type="button" class="btn btn-outline school-save" data-toggle="no">Save places</button>' +
            '<button type="button" class="btn btn-outline school-save" data-toggle="yes">' + (s.active ? "Stop taking part" : "Take part again") + "</button></div></div>";
    }).join("");
}

document.getElementById("schoolList").addEventListener("click", async function (event) {
    const button = event.target.closest(".school-save");
    const card = event.target.closest("[data-school]");
    if (!button || !card) return;

    const current = card.dataset.current === "true";
    const active = button.dataset.toggle === "yes" ? !current : current;
    say("");

    const { error } = await db.rpc("admin_ambassador_school_save", {
        p_id: card.dataset.school,
        p_name: card.dataset.name,
        p_country: card.dataset.country,
        p_active: active,
        p_extra_business: parseInt(card.querySelector(".x-b").value || "0", 10),
        p_extra_student: parseInt(card.querySelector(".x-s").value || "0", 10),
        p_extra_lecturer: parseInt(card.querySelector(".x-l").value || "0", 10)
    });

    if (error) { say(error.message, "error"); return; }
    say("Saved.", "ok");
    await loadSchools();
});

document.getElementById("schoolForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    say("");

    const { error } = await db.rpc("admin_ambassador_school_save", {
        p_id: null,
        p_name: document.getElementById("schoolName").value,
        p_country: document.getElementById("schoolCountry").value,
        p_active: true
    });

    if (error) { say(error.message, "error"); return; }
    document.getElementById("schoolName").value = "";
    say("School added.", "ok");
    await loadSchools();
});

(async function init() {
    if (!db) { say("Supabase is not connected yet.", "error"); return; }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("ambassador-admin.html");
        return;
    }

    try { await db.rpc("ambassador_run_expiry"); } catch (e) {}

    try {
        const due = await db.rpc("admin_ambassador_reviews_due");
        if (!due.error && due.data > 0) say(due.data + " ambassador" + (due.data === 1 ? " has" : "s have") + " no quarterly review yet this quarter. Open the Ambassadors tab.", "");
    } catch (e) {}

    showTab("applications");
})();


// ---------- Payments and reports ----------

const payMonth = document.getElementById("payMonth");
payMonth.value = new Date().toISOString().slice(0, 7);

function monthDate() {
    return (payMonth.value || new Date().toISOString().slice(0, 7)) + "-01";
}

let lastReport = [];

async function loadPayments() {
    await loadStipends();
    await loadReport();
}

async function loadStipends() {
    const box = document.getElementById("stipendList");
    const { data, error } = await db.rpc("admin_stipend_list", { p_month: monthDate(), p_status: document.getElementById("stipendFilter").value });

    if (error) { box.innerHTML = ""; fail(error); return; }

    box.innerHTML = data.length === 0 ? "<p class='meta'>No stipends for this month yet. Press the button above to create them.</p>" : data.map(function (s) {
        return '<div class="staff-card" data-stipend="' + escapeHTML(s.id) + '"><strong>' + escapeHTML(s.full_name || "Member") + " &bull; " + naira(s.amount_kobo) + "</strong>" +
            '<div class="meta">' + escapeHTML(TYPE[s.ambassador_type]) + " &bull; " + escapeHTML(RANK[s.ambassador_rank]) + " &bull; " + escapeHTML(s.school_name || "") +
            " &bull; <strong>" + escapeHTML(s.status) + "</strong>" + (s.payment_ref ? " &bull; ref " + escapeHTML(s.payment_ref) : "") + (s.status === "withheld" && s.note ? " &bull; " + escapeHTML(s.note) : "") + "</div>" +
            '<div class="meta">' + (s.bank_name ? escapeHTML(s.bank_name) + " &bull; " + escapeHTML(s.account_number) + " &bull; " + escapeHTML(s.account_name) : "No bank details saved yet") + "</div>" +
            (s.status !== "paid" ? '<div class="staff-actions">' +
                (s.status === "pending" || s.status === "withheld" ? '<button type="button" class="btn btn-outline stp-act" data-status="approved">Approve</button>' : "") +
                (s.status === "approved" ? '<button type="button" class="btn btn-outline stp-act" data-status="paid">Mark paid</button>' : "") +
                (s.status !== "withheld" ? '<button type="button" class="btn btn-outline stp-act" data-status="withheld">Withhold</button>' : "") +
                "</div>" : "") + "</div>";
    }).join("");
}

async function loadReport() {
    const box = document.getElementById("reportBox");
    const { data, error } = await db.rpc("admin_ambassador_report", { p_month: monthDate() });

    if (error) { box.innerHTML = ""; return; }
    lastReport = data;

    const total = data.reduce(function (t, r) {
        t.stipend += r.stipend_status === "paid" ? r.stipend_kobo : 0;
        t.commission += Number(r.commission_kobo || 0);
        t.subs += Number(r.paid_subscriptions || 0);
        return t;
    }, { stipend: 0, commission: 0, subs: 0 });

    box.innerHTML = data.length === 0 ? "<p class='meta'>No ambassadors were active in this month.</p>" :
        '<p class="meta">Stipends paid: ' + naira(total.stipend) + " &bull; Commission earned: " + naira(total.commission) + " &bull; Paid subscriptions: " + total.subs + "</p>" +
        data.map(function (r) {
            return '<div class="staff-card"><strong>' + escapeHTML(r.full_name || "Member") + "</strong>" +
                '<div class="meta">' + escapeHTML(TYPE[r.ambassador_type]) + " &bull; " + escapeHTML(r.school_name || "") + " &bull; " + escapeHTML(r.appointment_status) + "</div>" +
                '<div class="meta">Stipend: ' + (r.stipend_kobo ? naira(r.stipend_kobo) + " (" + escapeHTML(r.stipend_status) + ")" : "none") +
                " &bull; Signed up: " + r.signed_up + " &bull; Paid subscriptions: " + r.paid_subscriptions + " &bull; Commission: " + naira(r.commission_kobo) +
                (r.flagged > 0 ? " &bull; " + r.flagged + " being checked" : "") + "</div></div>";
        }).join("");
}

payMonth.addEventListener("change", loadPayments);
document.getElementById("stipendFilter").addEventListener("change", loadStipends);

document.getElementById("genStipends").addEventListener("click", async function () {
    if (!confirm("Create the stipend records for " + payMonth.value + "? Nothing is paid until you approve and mark each one.")) return;
    say("");
    const { data, error } = await db.rpc("admin_stipend_generate", { p_month: monthDate() });
    if (error) { say(error.message, "error"); return; }
    say(data + " new stipend record" + (data === 1 ? "" : "s") + " created.", "ok");
    await loadPayments();
});

document.getElementById("stipendList").addEventListener("click", async function (event) {
    const button = event.target.closest(".stp-act");
    const card = event.target.closest("[data-stipend]");
    if (!button || !card) return;

    const status = button.dataset.status;
    let note = "";

    if (status === "withheld") {
        note = prompt("Why is this stipend being withheld? (the ambassador will see this):", "");
        if (note === null) return;
    } else if (status === "paid") {
        note = prompt("Transfer reference (optional):", "");
        if (note === null) return;
    }

    say("");
    const { error } = await db.rpc("admin_stipend_set", { p_id: card.dataset.stipend, p_status: status, p_note: note });
    if (error) { say(error.message, "error"); return; }
    await loadPayments();
});

document.getElementById("csvBtn").addEventListener("click", function () {
    const rows = [["Name", "School", "Type", "Rank", "Status", "Stipend (NGN)", "Stipend status", "Signed up", "Paid subscriptions", "Commission (NGN)"]];
    lastReport.forEach(function (r) {
        rows.push([r.full_name, r.school_name, r.ambassador_type, r.ambassador_rank, r.appointment_status,
            r.stipend_kobo ? r.stipend_kobo / 100 : "", r.stipend_status || "", r.signed_up, r.paid_subscriptions, (r.commission_kobo || 0) / 100]);
    });

    // A leading apostrophe stops a spreadsheet from running a name that starts with = + - or @ as a formula
    const csv = rows.map(function (row) {
        return row.map(function (cell) {
            let v = String(cell ?? "");
            if (/^[=+\-@]/.test(v)) v = "'" + v;
            return '"' + v.replace(/"/g, '""') + '"';
        }).join(",");
    }).join("\n");

    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "ambassador-report-" + payMonth.value + ".csv";
    link.click();
    URL.revokeObjectURL(link.href);
});


// ---------- Career: rank, salary, transfers and schools (Super Admin changes; other admins can read) ----------

const RANK_ORDER = ["school", "senior", "regional_manager", "national_director"];
let isSuper = null;

async function checkSuper() {
    if (isSuper !== null) return isSuper;
    try {
        const { data: s } = await db.auth.getSession();
        const { data } = await db.from("profiles").select("is_super_admin").eq("id", s.session.user.id).maybeSingle();
        isSuper = !!(data && data.is_super_admin);
    } catch (e) { isSuper = false; }
    return isSuper;
}

function schoolOptions(exceptId) {
    return schoolsCache.filter(function (s) { return s.active && s.id !== exceptId; }).map(function (s) {
        return '<option value="' + escapeHTML(s.id) + '">' + escapeHTML(s.name) + "</option>";
    }).join("");
}

async function openCareer(card) {
    const holder = card.querySelector(".amb-hist-box");
    const { data, error } = await db.rpc("admin_ambassador_career", { p_id: card.dataset.amb });
    if (error) { say(error.message, "error"); return; }

    if (schoolsCache.length === 0) {
        const s = await db.rpc("admin_ambassador_schools");
        schoolsCache = s.data || [];
    }

    const sup = await checkSuper();
    const p = data.performance;
    const manager = data.ambassador_rank === "regional_manager" || data.ambassador_rank === "national_director";

    const history = data.changes.length === 0 ? "<p class='meta'>No promotions or transfers yet.</p>" : data.changes.map(function (c) {
        let line = "";
        if (c.type === "promotion" || c.type === "rank_change") line = (c.type === "promotion" ? "Promotion" : "Rank change") + ": " + RANK[c.old_rank] + " to " + RANK[c.new_rank] + " (salary " + naira(c.old_salary_kobo) + " to " + naira(c.new_salary_kobo) + ")";
        else if (c.type === "salary") line = "Salary " + naira(c.old_salary_kobo) + " to " + naira(c.new_salary_kobo);
        else if (c.type === "transfer") line = "Transfer: " + (c.old_school || "none") + " to " + (c.new_school || "none");
        else line = "School " + (c.detail || "") + ": " + (c.new_school || "");
        return "<p class='meta'>" + escapeHTML(d(c.created_at)) + " &bull; " + escapeHTML(line) + (c.reason ? " &bull; " + escapeHTML(c.reason) : "") + "</p>";
    }).join("");

    holder.innerHTML =
        "<h4>Career</h4>" +
        "<p><strong>" + escapeHTML(RANK[data.ambassador_rank]) + "</strong> &bull; " + escapeHTML(TYPE[data.ambassador_type]) + " &bull; " + escapeHTML(data.appointment_status) + "</p>" +
        "<p class='meta'>School: " + escapeHTML(data.school || "none") + (data.region ? " &bull; Region: " + escapeHTML(data.region) : "") +
        " &bull; Salary: " + (data.salary_kobo ? naira(data.salary_kobo) + "/month" + (data.salary_is_custom ? " (approved)" : " (standard)") : "not approved yet") + "</p>" +
        (manager ? "<p class='meta'>Assigned schools: " + (data.assigned_schools.length ? data.assigned_schools.map(function (s) { return escapeHTML(s.name); }).join(", ") : "none yet") + "</p>" : "") +
        "<p class='meta'>Performance: " + p.reviews + " review(s)" + (p.average_score != null ? ", average score " + p.average_score : "") + (p.last_review ? ", last: " + escapeHTML(p.last_review) : "") +
        " &bull; warnings " + p.warnings + " &bull; signed up " + p.signed_up + " &bull; paid subscriptions " + p.paid_subscriptions + "</p>" +
        "<h4>Promotion and transfer history</h4>" + history +
        (sup && (data.appointment_status === "confirmed" || data.appointment_status === "suspended") ?
            "<h4>Super Admin controls</h4>" +
            '<div class="career-form" data-school="' + escapeHTML(data.school_id || "") + '">' +
            '<p class="meta">Change rank</p>' +
            '<select class="c-rank">' + RANK_ORDER.map(function (r) { return '<option value="' + r + '"' + (r === data.ambassador_rank ? " selected" : "") + ">" + RANK[r] + "</option>"; }).join("") + "</select>" +
            '<input type="number" class="c-rank-salary" min="1" placeholder="Monthly salary in naira (needed for Regional and National)">' +
            '<input type="text" class="c-region" maxlength="80" placeholder="Region (Regional and National only)" value="' + escapeHTML(data.region || "") + '">' +
            '<input type="text" class="c-rank-reason" maxlength="300" placeholder="Reason (kept in the record)">' +
            '<button type="button" class="btn btn-outline" data-career="rank">Save rank</button>' +
            '<p class="meta">Approve salary</p>' +
            '<input type="number" class="c-salary" min="1" placeholder="Monthly salary in naira">' +
            '<input type="text" class="c-salary-reason" maxlength="300" placeholder="Reason (kept in the record)">' +
            '<button type="button" class="btn btn-outline" data-career="salary">Approve salary</button>' +
            '<p class="meta">Transfer to another school</p>' +
            '<select class="c-school">' + schoolOptions(data.school_id) + "</select>" +
            '<input type="text" class="c-transfer-reason" maxlength="300" placeholder="Reason (kept in the record)">' +
            '<button type="button" class="btn btn-outline" data-career="transfer">Transfer</button>' +
            (manager ? '<p class="meta">Assigned schools (Regional and National managers)</p>' +
                '<select class="c-assign">' + schoolOptions(null) + "</select>" +
                '<button type="button" class="btn btn-outline" data-career="assign">Assign school</button>' +
                '<button type="button" class="btn btn-outline" data-career="unassign">Remove school</button>' : "") +
            "</div>"
            : (data.appointment_status === "confirmed" || data.appointment_status === "suspended" ? "<p class='meta'>Only the Super Admin can change ranks, salaries, transfers and school assignments.</p>" : ""));
}

async function careerAction(card, kind) {
    const form = card.querySelector(".career-form");
    if (!form) return;
    const q = function (c) { return form.querySelector(c); };
    const id = card.dataset.amb;
    let res;
    say("");

    if (kind === "rank") {
        if (!confirm("Change this ambassador's rank?")) return;
        const salary = q(".c-rank-salary").value.trim();
        res = await db.rpc("admin_ambassador_set_rank", {
            p_id: id, p_rank: q(".c-rank").value, p_salary_kobo: salary === "" ? null : Math.round(parseFloat(salary) * 100),
            p_region: q(".c-region").value, p_reason: q(".c-rank-reason").value
        });
    } else if (kind === "salary") {
        const salary = q(".c-salary").value.trim();
        if (salary === "" && !confirm("No amount entered. This returns the ambassador to the standard salary for the rank. Continue?")) return;
        res = await db.rpc("admin_ambassador_set_salary", {
            p_id: id, p_salary_kobo: salary === "" ? null : Math.round(parseFloat(salary) * 100), p_reason: q(".c-salary-reason").value
        });
    } else if (kind === "transfer") {
        if (!confirm("Transfer this ambassador to the chosen school?")) return;
        res = await db.rpc("admin_ambassador_transfer", { p_id: id, p_school: q(".c-school").value, p_reason: q(".c-transfer-reason").value });
    } else {
        res = await db.rpc("admin_ambassador_assign_school", { p_id: id, p_school: q(".c-assign").value, p_assign: kind === "assign", p_reason: "" });
    }

    if (res.error) { say(res.error.message, "error"); return; }
    say("Saved.", "ok");
    schoolsCache = [];
    await loadAppointments();
}