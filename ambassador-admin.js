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

function d(value) {
    return value ? new Date(value).toLocaleDateString() : "";
}

function showTab(name) {
    ["applications", "appointments", "schools"].forEach(function (t) {
        document.getElementById("tab-" + t).style.display = t === name ? "" : "none";
    });
    document.querySelectorAll(".amb-tab").forEach(function (b) {
        b.classList.toggle("active", b.dataset.tab === name);
    });
    if (name === "applications") loadApplications();
    if (name === "appointments") loadAppointments();
    if (name === "schools") loadSchools();
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
            (a.left_at ? " &bull; left " + d(a.left_at) + (a.left_reason ? " (" + escapeHTML(a.left_reason) + ")" : "") : "") + "</div>" +
            '<div class="staff-actions">' +
            (a.appointment_status === "suspended" ? '<button type="button" class="btn btn-outline amb-act" data-action="reinstate">Reinstate</button>' : "") +
            (a.appointment_status === "trial" || a.appointment_status === "confirmed" ? '<button type="button" class="btn btn-outline amb-act" data-action="suspend">Suspend</button>' : "") +
            (live ? '<button type="button" class="btn btn-outline amb-act" data-action="terminate">Terminate</button>' : "") +
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

    const button = event.target.closest(".amb-act");
    if (!button) return;

    const action = button.dataset.action;
    let reason = "";

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

    showTab("applications");
})();