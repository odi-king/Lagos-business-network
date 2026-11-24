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

// ---------- Performance and verification (4D-2) ----------
let pfRows = [];

function pfDates() {
    const days = parseInt(document.getElementById("pfPeriod").value, 10);
    if (!days) return { from: null, to: null };
    const to = new Date();
    const from = new Date(Date.now() - days * 86400000);
    const iso = function (x) { return x.toISOString().slice(0, 10); };
    return { from: iso(from), to: iso(to) };
}

async function loadPerformance() {
    const box = document.getElementById("pfTable");
    const dt = pfDates();
    const args = {
        p_from: dt.from, p_to: dt.to,
        p_school: document.getElementById("pfSchool").value || null,
        p_type: document.getElementById("pfType").value || null,
        p_status: document.getElementById("pfStatus").value
    };
    const [perf, over] = await Promise.all([
        db.rpc("monitoring_performance", args),
        db.rpc("monitoring_overview", { p_from: dt.from, p_to: dt.to })
    ]);
    if (perf.error) {
        box.innerHTML = "<p class='msg error'>" + escapeHTML(perf.error.message.indexOf("function") >= 0 ? "Not set up yet. Run supabase-monitoring-2.sql in Supabase." : perf.error.message) + "</p>";
        return;
    }
    pfRows = perf.data || [];

    const o = over.data || {};
    document.getElementById("pfCards").innerHTML =
        "<strong>" + (o.ambassadors || 0) + "</strong> ambassadors &bull; <strong>" + (o.registrations || 0) + "</strong> registrations &bull; <strong>" +
        (o.verified || 0) + "</strong> verified &bull; <strong>" + (o.active || 0) + "</strong> active &bull; <strong>" +
        (o.paid || 0) + "</strong> paid &bull; <strong>" + (o.flagged || 0) + "</strong> flagged";

    if (pfRows.length === 0) { box.innerHTML = "<p class='meta'>No ambassadors to show.</p>"; return; }

    box.innerHTML = '<div style="overflow-x:auto;"><table class="pf-table" style="width:100%;border-collapse:collapse;font-size:0.9rem;"><thead><tr>' +
        ["#", "ID", "Name", "School", "Registered", "Verified", "Active", "Paid", "Conversion", "Flagged", "Points", ""].map(function (t) {
            return '<th style="text-align:left;padding:6px;border-bottom:1px solid #334;">' + t + "</th>";
        }).join("") + "</tr></thead><tbody>" +
        pfRows.map(function (r) {
            const td = function (v) { return '<td style="padding:6px;border-bottom:1px solid #223;">' + v + "</td>"; };
            return "<tr>" + td(r.position) + td(escapeHTML(r.ambassador_no || "")) + td(escapeHTML(r.full_name)) + td(escapeHTML(r.school_name || "")) +
                td(r.registrations) + td(r.verified) + td(r.active) + td(r.paid) + td(r.conversion_pct + "%") +
                td(r.flagged ? "<strong>" + r.flagged + "</strong>" : "0") + td("<strong>" + r.points + "</strong>") +
                td('<a href="#" class="pf-open" data-amb="' + escapeHTML(r.ambassador_id) + '">Details</a>') + "</tr>";
        }).join("") + "</tbody></table></div>";
}

document.getElementById("pfTable").addEventListener("click", async function (event) {
    const a = event.target.closest(".pf-open");
    if (!a) return;
    event.preventDefault();
    const dt = pfDates();
    const box = document.getElementById("pfDetail");
    const { data, error } = await db.rpc("monitoring_ambassador_detail", { p_amb: a.dataset.amb, p_from: dt.from, p_to: dt.to });
    if (error) { say(error.message, "error"); return; }
    say("");
    const refs = data.referrals || [];
    box.innerHTML = '<div class="staff-card"><h3>' + escapeHTML(data.ambassador_no || "") + " " + escapeHTML(data.name) + "</h3>" +
        "<p class='meta'>" + escapeHTML(data.school || "") + " &bull; " + escapeHTML(data.type) + " &bull; " + escapeHTML(data.rank || "") + " &bull; " + escapeHTML(data.status) + "</p>" +
        (refs.length === 0 ? "<p class='meta'>No referrals in this period.</p>" : refs.map(function (r) {
            return "<p class='meta'>" + escapeHTML(r.first_name) + " &bull; " + escapeHTML(d(r.created_at)) + " &bull; " +
                (r.void ? "cancelled" : [r.email_confirmed ? "email confirmed" : "email not confirmed", r.active ? "active" : "not active lately", r.paid ? "PAID" : "not paid"].join(", ")) +
                (r.flagged ? " &bull; <strong>FLAGGED" + (r.flag_reason ? ": " + escapeHTML(r.flag_reason) : "") + "</strong>" : "") + "</p>";
        }).join("")) +
        '<p><a href="#" id="pfClose">Close</a></p></div>';
    box.scrollIntoView({ behavior: "smooth" });
});

document.getElementById("pfDetail").addEventListener("click", function (event) {
    if (event.target.id === "pfClose") { event.preventDefault(); document.getElementById("pfDetail").innerHTML = ""; }
});

["pfPeriod", "pfType", "pfSchool", "pfStatus"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", loadPerformance);
});

document.getElementById("pfCsv").addEventListener("click", function () {
    const rows = [["Position", "ID", "Name", "School", "Type", "Rank", "Status", "Registrations", "Verified", "Active", "Paid", "Conversion %", "Flagged", "Points"]];
    pfRows.forEach(function (r) {
        rows.push([r.position, r.ambassador_no, r.full_name, r.school_name, r.ambassador_type, r.ambassador_rank, r.appointment_status,
            r.registrations, r.verified, r.active, r.paid, r.conversion_pct, r.flagged, r.points]);
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
    link.download = "ambassador-performance-" + new Date().toISOString().slice(0, 10) + ".csv";
    link.click();
    URL.revokeObjectURL(link.href);
});

async function startPerformance() {
    const can = await db.rpc("monitoring_can_view");
    if (can.error || !can.data) return;
    document.getElementById("perfBox").style.display = "";
    const sc = await db.rpc("monitoring_schools");
    document.getElementById("pfSchool").innerHTML = '<option value="">All schools</option>' +
        (sc.data || []).map(function (s) { return '<option value="' + escapeHTML(s.id) + '">' + escapeHTML(s.name) + "</option>"; }).join("");
    await loadPerformance();
}

// ---------- Field verification and inspections (4D-3) ----------
const KIND = { school_visit: "School visit", promotion_check: "Promotion check", member_contact: "Member contact check" };
const RESULT = { verified: "Verified", concerns: "Concerns", failed: "Failed" };
const OUTCOME = { pending: "Not contacted yet", confirmed: "Confirmed", denied: "Denied", unreachable: "Unreachable" };
let inRows = [];
let canWrite = false;
let canReview = false;

async function loadInspections() {
    const box = document.getElementById("inList");
    const { data, error } = await db.rpc("monitoring_inspections_list", { p_status: document.getElementById("inFilter").value || null });
    if (error) {
        box.innerHTML = "<p class='msg error'>" + escapeHTML(error.message.indexOf("function") >= 0 ? "Not set up yet. Run supabase-monitoring-3.sql in Supabase." : error.message) + "</p>";
        return;
    }
    inRows = data || [];
    box.innerHTML = inRows.length === 0 ? "<p class='meta'>No reports here.</p>" : inRows.map(function (r) {
        const c = r.contacts && r.contacts.total ? " &bull; contacts: " + r.contacts.confirmed + " confirmed, " + r.contacts.denied + " denied, " + r.contacts.unreachable + " unreachable of " + r.contacts.total : "";
        const open = r.mine && (r.status === "draft" || r.status === "returned");
        return '<div class="staff-card" data-insp="' + escapeHTML(r.id) + '"><strong>' + escapeHTML(r.ambassador_no || "") + " " + escapeHTML(r.ambassador_name) + "</strong> <span class='meta'>" +
            escapeHTML(r.school || "") + " &bull; " + escapeHTML(KIND[r.kind]) + " &bull; " + escapeHTML(d(r.visited_on)) + " &bull; <strong>" + escapeHTML(RESULT[r.result]) + "</strong> &bull; " + escapeHTML(r.status) + "</span>" +
            "<p class='meta'>By " + escapeHTML(r.officer_name) + c + "</p>" +
            (r.findings ? "<p>" + escapeHTML(r.findings) + "</p>" : "") +
            (r.reviewer_note ? "<p class='meta'>Reviewer: " + escapeHTML(r.reviewer_note) + "</p>" : "") +
            (open ? '<p><a href="#" class="in-edit">Open and edit</a></p>' : "") +
            (canReview && r.status === "submitted" && !r.mine ? '<p><button type="button" class="contact-btn in-accept">Accept</button> <button type="button" class="btn btn-outline in-return">Send back</button></p>' : "") + "</div>";
    }).join("");
}

function inReset() {
    document.getElementById("inForm").style.display = "none";
    document.getElementById("inId").value = "";
    document.getElementById("inChecks").innerHTML = "";
}

async function inFillAmbassadors() {
    const { data } = await db.rpc("monitoring_performance", { p_status: "live" });
    document.getElementById("inAmb").innerHTML = (data || []).map(function (r) {
        return '<option value="' + escapeHTML(r.ambassador_id) + '">' + escapeHTML((r.ambassador_no || "") + " " + r.full_name + " (" + (r.school_name || "") + ")") + "</option>";
    }).join("");
}

async function inShowChecks(id) {
    const box = document.getElementById("inChecks");
    const { data, error } = await db.rpc("monitoring_inspection_checks", { p_inspection: id });
    if (error) { say(error.message, "error"); return; }
    const rows = data || [];
    document.getElementById("inDraw").style.display = rows.length === 0 && document.getElementById("inKind").value === "member_contact" ? "" : "none";
    box.innerHTML = rows.length === 0 ? "" : "<h3>Members to contact</h3>" + rows.map(function (c) {
        return '<div class="staff-card" data-check="' + escapeHTML(c.check_id) + '"><strong>' + escapeHTML(c.first_name) + "</strong> <span class='meta'>joined " + escapeHTML(d(c.joined)) + (c.email ? " &bull; " + escapeHTML(c.email) : "") + " &bull; " + escapeHTML(OUTCOME[c.outcome]) + "</span>" +
            '<p><select class="ck-outcome"><option value="confirmed">They confirm they joined through this ambassador</option><option value="denied">They say they did not</option><option value="unreachable">Could not reach them</option></select> ' +
            '<input type="text" class="ck-note" maxlength="300" placeholder="Note (optional)" value="' + escapeHTML(c.note || "") + '"> <button type="button" class="btn btn-outline ck-save">Save</button></p></div>';
    }).join("");
}

document.getElementById("inNew").addEventListener("click", async function () {
    inReset();
    document.getElementById("inFormTitle").textContent = "New report";
    document.getElementById("inDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("inFindings").value = "";
    document.getElementById("inAmb").disabled = false;
    document.getElementById("inKind").disabled = false;
    await inFillAmbassadors();
    document.getElementById("inForm").style.display = "";
});
document.getElementById("inCancel").addEventListener("click", inReset);
document.getElementById("inFilter").addEventListener("change", loadInspections);

async function inSave(submit) {
    say("");
    const id = document.getElementById("inId").value || null;
    const r = await db.rpc("monitoring_inspection_save", {
        p_id: id, p_amb: document.getElementById("inAmb").value, p_kind: document.getElementById("inKind").value,
        p_visited: document.getElementById("inDate").value, p_findings: document.getElementById("inFindings").value,
        p_result: document.getElementById("inResult").value, p_submit: submit
    });
    if (r.error) { say(r.error.message, "error"); return null; }
    document.getElementById("inId").value = r.data;
    return r.data;
}

document.getElementById("inForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    const id = await inSave(false);
    if (!id) return;
    say("Draft saved.", "ok");
    if (document.getElementById("inKind").value === "member_contact") await inShowChecks(id);
    await loadInspections();
});

document.getElementById("inSubmit").addEventListener("click", async function () {
    if (!confirm("Submit this report? You will not be able to change it afterwards.")) return;
    const id = await inSave(true);
    if (!id) return;
    say("Report submitted for review.", "ok");
    inReset();
    await loadInspections();
});

document.getElementById("inDraw").addEventListener("click", async function () {
    const id = await inSave(false);
    if (!id) return;
    const { error } = await db.rpc("monitoring_draw_members", { p_inspection: id, p_count: 5 });
    if (error) { say(error.message, "error"); return; }
    await inShowChecks(id);
});

document.getElementById("inChecks").addEventListener("click", async function (event) {
    const b = event.target.closest(".ck-save");
    if (!b) return;
    const card = b.closest("[data-check]");
    const { error } = await db.rpc("monitoring_contact_record", {
        p_check: card.dataset.check, p_outcome: card.querySelector(".ck-outcome").value, p_note: card.querySelector(".ck-note").value
    });
    if (error) { say(error.message, "error"); return; }
    say("Saved.", "ok");
    await inShowChecks(document.getElementById("inId").value);
});

document.getElementById("inList").addEventListener("click", async function (event) {
    const card = event.target.closest("[data-insp]");
    if (!card) return;
    const r = inRows.find(function (x) { return x.id === card.dataset.insp; });

    if (event.target.closest(".in-edit") && r) {
        event.preventDefault();
        await inFillAmbassadors();
        document.getElementById("inFormTitle").textContent = "Edit report";
        document.getElementById("inId").value = r.id;
        document.getElementById("inAmb").value = r.ambassador_id;
        document.getElementById("inAmb").disabled = true;
        document.getElementById("inKind").value = r.kind;
        document.getElementById("inKind").disabled = true;
        document.getElementById("inDate").value = r.visited_on;
        document.getElementById("inResult").value = r.result;
        document.getElementById("inFindings").value = r.findings || "";
        document.getElementById("inForm").style.display = "";
        if (r.kind === "member_contact") await inShowChecks(r.id); else document.getElementById("inChecks").innerHTML = "";
        document.getElementById("inForm").scrollIntoView({ behavior: "smooth" });
        return;
    }

    if (event.target.closest(".in-accept") || event.target.closest(".in-return")) {
        const accept = !!event.target.closest(".in-accept");
        let note = null;
        if (!accept) {
            note = prompt("Tell the officer what to fix:");
            if (!note) return;
        }
        const { error } = await db.rpc("monitoring_inspection_review", { p_id: card.dataset.insp, p_decision: accept ? "accepted" : "returned", p_note: note });
        if (error) { say(error.message, "error"); return; }
        say(accept ? "Report accepted." : "Report sent back.", "ok");
        await loadInspections();
    }
});

async function startInspections() {
    canWrite = ["field_officer", "member_verifier", "head", "super"].indexOf(myRole) >= 0;
    canReview = ["super", "head", "performance_officer"].indexOf(myRole) >= 0;
    document.getElementById("inspBox").style.display = "";
    document.getElementById("inNew").style.display = canWrite ? "" : "none";
    await loadInspections();
}

(async function init() {
    if (!db) { say("Supabase is not connected yet.", "error"); return; }
    const { data } = await db.auth.getSession();
    if (!data.session) { window.location.href = "auth.html?next=" + encodeURIComponent("monitoring.html"); return; }

    const role = await db.rpc("monitoring_my_role");
    if (role.error) { say("Not set up yet. Run supabase-monitoring.sql in Supabase.", "error"); return; }
    myRole = role.data;

    if (!myRole) { say("This area is only for the Monitoring Department team and the Super Admin.", "error"); return; }

    await startPerformance();
    await startInspections();

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