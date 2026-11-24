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

const ROLE = {
    head: "Head of Ambassador Monitoring",
    performance_officer: "Performance Monitoring Officer",
    field_officer: "Field Verification Officer",
    data_analyst: "Data and Fraud Analyst",
    member_verifier: "Member Verification Officer"
};
const ELIG = { graduate: "Qualified graduate", nysc: "NYSC member", professional: "Experienced professional", field_trained: "Trained field personnel" };

const msg = document.getElementById("monMsg");
let myRole = null;
let schools = [];

function say(text, kind) {
    msg.textContent = text || "";
    msg.className = "msg " + (kind || "");
}

function d(value) {
    return value ? new Date(value).toLocaleDateString() : "";
}

function showTab(name) {
    ["staff", "applications", "activity"].forEach(function (t) {
        document.getElementById("tab-" + t).style.display = t === name ? "" : "none";
    });
    document.querySelectorAll(".mon-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    if (name === "staff") loadStaff();
    if (name === "applications") loadApplications();
    if (name === "activity") loadActivity();
}

document.getElementById("monTabs").addEventListener("click", function (event) {
    const b = event.target.closest(".mon-tab");
    if (b) showTab(b.dataset.tab);
});

function schoolOptions() {
    return schools.map(function (s) { return '<option value="' + escapeHTML(s.id) + '">' + escapeHTML(s.name) + "</option>"; }).join("");
}

async function loadStaff() {
    const box = document.getElementById("staffList");
    const { data, error } = await db.rpc("monitoring_staff_list", { p_status: document.getElementById("staffFilter").value });

    if (error) { box.innerHTML = ""; say(error.message, "error"); return; }

    if (schools.length === 0) {
        const s = await db.rpc("ambassador_vacancies");
        const seen = {};
        schools = (s.data || []).filter(function (r) { if (seen[r.school_id]) return false; seen[r.school_id] = true; return true; })
            .map(function (r) { return { id: r.school_id, name: r.school_name }; });
    }

    const isSuper = myRole === "super";

    box.innerHTML = data.length === 0 ? "<p class='meta'>No team members yet.</p>" : data.map(function (s) {
        const live = s.status !== "ended";
        return '<div class="staff-card" data-staff="' + escapeHTML(s.id) + '"><strong>' + escapeHTML(s.full_name) + "</strong> <span class='meta'>" + escapeHTML(s.staff_no) + " &bull; " + escapeHTML(ROLE[s.role]) + " &bull; <strong>" + escapeHTML(s.status) + "</strong></span>" +
            '<div class="meta">' + escapeHTML(s.email || "") + (s.region ? " &bull; " + escapeHTML(s.region) : "") + " &bull; since " + escapeHTML(d(s.start_date)) +
            (s.ended_at ? " &bull; ended " + escapeHTML(d(s.ended_at)) + (s.end_reason ? " (" + escapeHTML(s.end_reason) + ")" : "") : "") + "</div>" +
            (s.role === "head" ? '<div class="meta">Covers the whole department</div>' :
                '<div class="meta">Assigned: ' + (s.assignments.length ? s.assignments.map(function (a) {
                    return escapeHTML(a.school || ("region " + a.region)) + (live ? ' <a href="#" class="unassign" data-school="' + escapeHTML(a.school_id || "") + '" data-region="' + escapeHTML(a.region || "") + '">remove</a>' : "");
                }).join(", ") : "nothing yet") + "</div>") +
            '<div class="meta">Activity: ' + s.activity_count + " action(s)" + (s.last_activity ? ", last " + escapeHTML(d(s.last_activity)) : "") + "</div>" +
            (live && s.role !== "head" ? '<div class="staff-actions">' +
                '<select class="as-school"><option value="">Assign a school...</option>' + schoolOptions() + "</select>" +
                '<button type="button" class="btn btn-outline as-school-btn">Assign school</button>' +
                '<input type="text" class="as-region" maxlength="80" placeholder="or a region">' +
                '<button type="button" class="btn btn-outline as-region-btn">Assign region</button></div>' : "") +
            '<div class="staff-actions"><button type="button" class="btn btn-outline st-activity">Activity</button>' +
            (isSuper && live ? (s.status === "active" ? '<button type="button" class="btn btn-outline st-act" data-status="suspended">Suspend</button>' : '<button type="button" class="btn btn-outline st-act" data-status="active">Reinstate</button>') +
                '<button type="button" class="btn btn-outline st-act" data-status="ended">End appointment</button>' : "") + "</div>" +
            '<div class="st-box"></div></div>';
    }).join("");
}

document.getElementById("staffFilter").addEventListener("change", loadStaff);

document.getElementById("staffList").addEventListener("click", async function (event) {
    const card = event.target.closest("[data-staff]");
    if (!card) return;
    const id = card.dataset.staff;
    say("");

    const un = event.target.closest(".unassign");
    if (un) {
        event.preventDefault();
        const r = await db.rpc("monitoring_assign", { p_staff: id, p_school: un.dataset.school || null, p_region: un.dataset.region || null, p_assign: false });
        if (r.error) { say(r.error.message, "error"); return; }
        await loadStaff();
        return;
    }

    if (event.target.closest(".as-school-btn")) {
        const school = card.querySelector(".as-school").value;
        if (!school) { say("Choose a school first.", "error"); return; }
        const r = await db.rpc("monitoring_assign", { p_staff: id, p_school: school, p_region: null, p_assign: true });
        if (r.error) { say(r.error.message, "error"); return; }
        say("Assigned.", "ok");
        await loadStaff();
        return;
    }

    if (event.target.closest(".as-region-btn")) {
        const region = card.querySelector(".as-region").value.trim();
        if (!region) { say("Enter a region first.", "error"); return; }
        const r = await db.rpc("monitoring_assign", { p_staff: id, p_school: null, p_region: region, p_assign: true });
        if (r.error) { say(r.error.message, "error"); return; }
        say("Assigned.", "ok");
        await loadStaff();
        return;
    }

    if (event.target.closest(".st-activity")) {
        const holder = card.querySelector(".st-box");
        if (holder.innerHTML) { holder.innerHTML = ""; return; }
        const r = await db.rpc("monitoring_activity_list", { p_staff: id });
        if (r.error) { say(r.error.message, "error"); return; }
        holder.innerHTML = r.data.length === 0 ? "<p class='meta'>No activity yet.</p>" : r.data.map(activityLine).join("");
        return;
    }

    const act = event.target.closest(".st-act");
    if (act) {
        const status = act.dataset.status;
        let reason = "";
        if (status !== "active") {
            reason = prompt((status === "ended" ? "End this appointment. " : "Suspend this team member. ") + "Write the reason (kept in the record):", "");
            if (reason === null) return;
        }
        const r = await db.rpc("monitoring_staff_set_status", { p_id: id, p_status: status, p_reason: reason });
        if (r.error) { say(r.error.message, "error"); return; }
        say("Done.", "ok");
        await loadStaff();
    }
});

function activityLine(a) {
    return "<p class='meta'>" + escapeHTML(new Date(a.created_at).toLocaleString()) + " &bull; <strong>" + escapeHTML(a.action) + "</strong> &bull; " +
        escapeHTML(a.who) + (a.staff_no ? " (" + escapeHTML(a.staff_no) + ")" : "") + (a.details ? " &bull; " + escapeHTML(a.details) : "") + "</p>";
}

async function loadActivity() {
    const box = document.getElementById("activityList");
    const { data, error } = await db.rpc("monitoring_activity_list", { p_staff: null });
    if (error) { box.innerHTML = ""; say(error.message, "error"); return; }
    box.innerHTML = data.length === 0 ? "<p class='meta'>Nothing recorded yet.</p>" : data.map(activityLine).join("");
}

async function loadApplications() {
    const box = document.getElementById("appList");
    const { data, error } = await db.rpc("monitoring_applications_list", { p_status: document.getElementById("appFilter").value });
    if (error) { box.innerHTML = ""; say(error.message, "error"); return; }
    const isSuper = myRole === "super";

    box.innerHTML = data.length === 0 ? "<p class='meta'>Nothing here.</p>" : data.map(function (a) {
        const open = a.status === "submitted" || a.status === "reviewing";
        return '<div class="staff-card" data-app="' + escapeHTML(a.id) + '" data-role="' + escapeHTML(a.role_applied) + '"><strong>' + escapeHTML(a.full_name) + "</strong> <span class='meta'>" + escapeHTML(ROLE[a.role_applied]) + " &bull; " + escapeHTML(a.status) + " &bull; " + escapeHTML(d(a.created_at)) + "</span>" +
            (a.is_ambassador ? "<p class='msg error'>This person holds an ambassador appointment and cannot join the department.</p>" : "") +
            "<p class='meta'>" + escapeHTML(a.email) + " &bull; " + escapeHTML(a.phone) + " &bull; " + escapeHTML(a.location) + " &bull; " + escapeHTML(ELIG[a.eligibility]) + "</p>" +
            "<p><strong>Qualification:</strong> " + escapeHTML(a.qualification) + "</p>" +
            (a.experience ? "<p><strong>Experience:</strong> " + escapeHTML(a.experience) + "</p>" : "") +
            "<p><strong>Why:</strong> " + escapeHTML(a.why_text) + "</p>" +
            "<p><strong>Referee:</strong> " + escapeHTML(a.referee_name) + " (" + escapeHTML(a.referee_contact) + ")</p>" +
            (a.internal_note ? "<p class='meta'>Internal note: " + escapeHTML(a.internal_note) + "</p>" : "") +
            (open ? '<input type="text" class="app-note" maxlength="600" placeholder="Internal note (not shown to the applicant)">' +
                (isSuper ? '<select class="app-role">' + Object.keys(ROLE).map(function (r) { return '<option value="' + r + '"' + (r === a.role_applied ? " selected" : "") + ">" + ROLE[r] + "</option>"; }).join("") + "</select>" +
                    '<input type="text" class="app-region" maxlength="80" placeholder="Region (optional)">' : "") +
                '<div class="staff-actions">' +
                (a.status === "submitted" ? '<button type="button" class="btn btn-outline app-act" data-action="review">Mark under review</button>' : "") +
                (isSuper ? '<button type="button" class="btn btn-outline app-act" data-action="accept">Accept and appoint</button><button type="button" class="btn btn-outline app-act" data-action="reject">Reject</button>' : "") +
                "</div>" : "") + "</div>";
    }).join("");
}

document.getElementById("appFilter").addEventListener("change", loadApplications);

document.getElementById("appList").addEventListener("click", async function (event) {
    const button = event.target.closest(".app-act");
    const card = event.target.closest("[data-app]");
    if (!button || !card) return;
    const action = button.dataset.action;
    if (action !== "review" && !confirm(action === "accept" ? "Accept and appoint this person?" : "Reject this application?")) return;
    say("");
    const role = card.querySelector(".app-role");
    const region = card.querySelector(".app-region");
    const note = card.querySelector(".app-note");
    const r = await db.rpc("monitoring_application_decide", {
        p_id: card.dataset.app, p_action: action, p_role: role ? role.value : null, p_region: region ? region.value : null, p_note: note ? note.value : null
    });
    if (r.error) { say(r.error.message, "error"); return; }
    say("Done.", "ok");
    await loadApplications();
});

document.getElementById("appointForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    say("");
    const r = await db.rpc("monitoring_appoint", { p_email: document.getElementById("apEmail").value, p_role: document.getElementById("apRole").value, p_region: document.getElementById("apRegion").value });
    if (r.error) { say(r.error.message, "error"); return; }
    document.getElementById("apEmail").value = "";
    say("Appointed.", "ok");
    await loadStaff();
});

(async function init() {
    if (!db) { say("Supabase is not connected yet.", "error"); return; }
    const { data } = await db.auth.getSession();
    if (!data.session) { window.location.href = "auth.html?next=" + encodeURIComponent("monitoring.html"); return; }

    const role = await db.rpc("monitoring_my_role");
    if (role.error) { say("Not set up yet. Run supabase-monitoring.sql in Supabase.", "error"); return; }
    myRole = role.data;

    if (!myRole) { say("This area is only for the Monitoring Department team and the Super Admin.", "error"); return; }

    if (myRole === "super" || myRole === "head") {
        document.getElementById("mgmtBox").style.display = "";
        if (myRole === "super") document.getElementById("appointBox").style.display = "";
        showTab("staff");
        return;
    }

    const mine = await db.rpc("my_monitoring_assignments");
    const box = document.getElementById("mineBox");
    box.style.display = "";
    const m = mine.data;
    box.innerHTML = !m ? "<p class='meta'>No record found.</p>" :
        "<h2>" + escapeHTML(ROLE[m.role]) + "</h2><p class='meta'>Staff number " + escapeHTML(m.staff_no) + " &bull; since " + escapeHTML(d(m.start_date)) + (m.region ? " &bull; " + escapeHTML(m.region) : "") + "</p>" +
        "<h3>My assignments</h3>" + (m.assignments.length ? m.assignments.map(function (a) { return "<p>" + escapeHTML(a.school || ("Region: " + a.region)) + "</p>"; }).join("") : "<p class='meta'>You have not been assigned a school or region yet.</p>") +
        "<p class='meta'>Verification, inspection and reporting tools will appear here as the department's work is set up. Everything you do is recorded.</p>";
})();