const PERMS = [
    { key: "members", label: "Members", help: "Approve lecturers and businesses, verify traders, graduate students and give free access." },
    { key: "finance", label: "Finance", help: "Payments, payouts, refunds, fees and payment settings." },
    { key: "support", label: "Support", help: "Read and resolve customer care messages." },
    { key: "content", label: "Content", help: "Delete posts, comments and handouts that break the rules." },
    { key: "marketplace", label: "Marketplace", help: "Look over trades and resolve disputes between buyers and sellers." },
    { key: "education", label: "Education", help: "Graduation requests and the graduation requirements." }
];

const ALL_KEYS = PERMS.map(function (p) { return p.key; });

const PRESETS = {
    finance: { title: "Finance", perms: ["finance"] },
    support: { title: "Support", perms: ["support"] },
    content: { title: "Content", perms: ["content"] },
    marketplace: { title: "Marketplace", perms: ["marketplace"] },
    education: { title: "Education", perms: ["education", "members"] },
    full: { title: "Full admin", perms: ALL_KEYS },
    custom: { title: "", perms: [] }
};

let picked = null;
let staff = [];

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function permLabel(key) {
    const found = PERMS.find(function (p) { return p.key === key; });
    return found ? found.label : key;
}

function permBoxes(checked) {
    return PERMS.map(function (p) {
        return '<label class="perm-row"><input type="checkbox" class="perm-check" value="' + p.key + '"' +
            (checked.indexOf(p.key) !== -1 ? " checked" : "") + '><span><strong>' + p.label +
            '</strong><br><span class="meta">' + p.help + "</span></span></label>";
    }).join("");
}

function checkedIn(container) {
    return Array.prototype.map.call(container.querySelectorAll(".perm-check:checked"), function (box) { return box.value; });
}

function setMessage(text, ok) {
    const box = document.getElementById("appointMsg");
    box.textContent = text;
    box.className = "msg " + (ok ? "ok" : "error");
}

async function init() {
    if (typeof requireAal2 === "function" && !(await requireAal2())) return;

    if (!db) {
        document.getElementById("teamNote").textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const session = (await db.auth.getSession()).data.session;

    if (!session) {
        window.location.href = "auth.html?next=admins.html";
        return;
    }

    const access = await db.rpc("my_admin_access");

    if (access.error) {
        document.getElementById("teamNote").textContent =
            "The admin team is not set up yet. Run supabase-admin-team.sql in Supabase first.";
        return;
    }

    const row = access.data && access.data[0];

    if (!row || !row.is_super) {
        document.getElementById("teamNote").textContent = "Only the Super Admin can manage the admin team.";
        return;
    }

    document.getElementById("teamBody").style.display = "block";
    document.getElementById("permGuide").innerHTML = PERMS.map(function (p) {
        return "<p><strong>" + p.label + "</strong><br><span class='meta'>" + p.help + "</span></p>";
    }).join("");

    applyPreset("finance");
    await Promise.all([loadStaff(), loadAudit(), loadMfaPanel()]);
}

// ---------- Appoint ----------

function applyPreset(key) {
    const preset = PRESETS[key];
    document.getElementById("roleTitle").value = preset.title;
    document.getElementById("appointPerms").innerHTML = permBoxes(preset.perms);
}

document.getElementById("presetSelect").addEventListener("change", function (event) {
    applyPreset(event.target.value);
});

let findTimer = null;

document.getElementById("findBox").addEventListener("input", function (event) {
    clearTimeout(findTimer);

    findTimer = setTimeout(async function () {
        const text = event.target.value.trim();
        const results = document.getElementById("findResults");

        if (text.length < 2) {
            results.innerHTML = "";
            return;
        }

        const { data, error } = await db.rpc("admin_find_account", { p_query: text });

        if (error) {
            results.innerHTML = "<p class='meta'>" + escapeHTML(error.message) + "</p>";
            return;
        }

        if (data.length === 0) {
            results.innerHTML = "<p class='meta'>No account found. They need to sign up first.</p>";
            return;
        }

        results.innerHTML = data.map(function (p) {
            return '<div class="member-row"><div><strong>' + escapeHTML(p.full_name || "Member") + "</strong><br>" +
                '<span class="meta">' + escapeHTML(p.email) + " &bull; " + escapeHTML(p.role || "") + "</span></div>" +
                '<button type="button" class="btn btn-outline pick-person" data-id="' + escapeHTML(p.id) +
                '" data-name="' + escapeHTML(p.full_name || "Member") + '" data-email="' + escapeHTML(p.email) + '">Choose</button></div>';
        }).join("");
    }, 300);
});

document.getElementById("findResults").addEventListener("click", function (event) {
    const button = event.target.closest(".pick-person");
    if (!button) return;

    picked = { id: button.dataset.id, name: button.dataset.name, email: button.dataset.email };

    document.getElementById("pickedLine").textContent = "Appointing " + picked.name + " (" + picked.email + ")";
    document.getElementById("appointBox").style.display = "block";
    document.getElementById("findResults").innerHTML = "";
    document.getElementById("findBox").value = "";
    setMessage("");
});

document.getElementById("appointCancel").addEventListener("click", function () {
    picked = null;
    document.getElementById("appointBox").style.display = "none";
});

document.getElementById("appointBtn").addEventListener("click", async function () {
    if (!picked) return;

    const permissions = checkedIn(document.getElementById("appointPerms"));
    const button = document.getElementById("appointBtn");

    button.disabled = true;

    const { error } = await db.rpc("admin_appoint", {
        p_user: picked.id,
        p_title: document.getElementById("roleTitle").value,
        p_permissions: permissions,
        p_note: document.getElementById("appointNote").value || null
    });

    button.disabled = false;

    if (error) {
        setMessage(error.message, false);
        return;
    }

    setMessage(picked.name + " is now an admin.", true);
    picked = null;
    document.getElementById("appointBox").style.display = "none";
    document.getElementById("appointNote").value = "";

    await Promise.all([loadStaff(), loadAudit()]);
});

// ---------- The team ----------

async function loadStaff() {
    const { data, error } = await db.rpc("admin_staff_list");
    const list = document.getElementById("staffList");

    if (error) {
        list.innerHTML = "<p class='meta'>Could not load the team. " + escapeHTML(error.message) + "</p>";
        return;
    }

    staff = data;

    if (staff.length === 0) {
        list.innerHTML = "<p class='meta'>No other admins yet. Appoint one above.</p>";
        return;
    }

    list.innerHTML = "";

    staff.forEach(function (s) {
        const suspended = s.status === "suspended";
        const card = document.createElement("div");
        card.className = "staff-card";
        card.dataset.id = s.user_id;

        card.innerHTML =
            '<div class="staff-top"><div><strong>' + escapeHTML(s.full_name || "Member") + "</strong><br>" +
            '<span class="meta">' + escapeHTML(s.email) + "</span></div>" +
            '<span class="badge ' + (suspended ? "badge-off" : "badge-on") + '">' + (suspended ? "Suspended" : "Active") + "</span></div>" +
            "<p><strong>" + escapeHTML(s.title) + "</strong></p>" +
            '<div class="chips">' + s.permissions.map(function (p) {
                return '<span class="chip active">' + escapeHTML(permLabel(p)) + "</span>";
            }).join("") + "</div>" +
            (suspended && s.suspended_reason ? "<p class='meta'>Reason: " + escapeHTML(s.suspended_reason) + "</p>" : "") +
            (s.note ? "<p class='meta'>Note: " + escapeHTML(s.note) + "</p>" : "") +
            "<p class='meta'>Appointed " + new Date(s.created_at).toLocaleDateString() +
            (s.appointed_by_name ? " by " + escapeHTML(s.appointed_by_name) : "") + "</p>" +
            '<div class="staff-actions">' +
            '<button type="button" class="btn btn-outline staff-edit">Change access</button>' +
            (suspended
                ? '<button type="button" class="btn btn-outline staff-reinstate">Reinstate</button>'
                : '<button type="button" class="btn btn-outline staff-suspend">Suspend</button>') +
            '<button type="button" class="plain-btn staff-remove" style="color:#ff6b6b;">Remove</button></div>' +
            '<div class="staff-edit-box" style="display:none;"></div>';

        list.appendChild(card);
    });
}

document.getElementById("staffList").addEventListener("click", async function (event) {
    const card = event.target.closest(".staff-card");
    if (!card) return;

    const id = card.dataset.id;
    const person = staff.find(function (s) { return s.user_id === id; });
    const name = person ? person.full_name || "this person" : "this person";

    if (event.target.closest(".staff-edit")) {
        const box = card.querySelector(".staff-edit-box");

        if (box.style.display === "block") {
            box.style.display = "none";
            return;
        }

        box.innerHTML =
            '<input type="text" class="edit-title" maxlength="40" value="' + escapeHTML(person.title) + '">' +
            permBoxes(person.permissions) +
            '<input type="text" class="edit-note" maxlength="300" placeholder="Private note (optional)" value="' + escapeHTML(person.note || "") + '">' +
            '<button type="button" class="contact-btn staff-save">Save changes</button>' +
            '<button type="button" class="plain-btn staff-cancel">Cancel</button>';
        box.style.display = "block";
        return;
    }

    if (event.target.closest(".staff-cancel")) {
        card.querySelector(".staff-edit-box").style.display = "none";
        return;
    }

    let result = null;

    if (event.target.closest(".staff-save")) {
        const box = card.querySelector(".staff-edit-box");

        result = await db.rpc("admin_update_staff", {
            p_user: id,
            p_title: box.querySelector(".edit-title").value,
            p_permissions: checkedIn(box),
            p_note: box.querySelector(".edit-note").value || null
        });
    } else if (event.target.closest(".staff-suspend")) {
        const reason = prompt("Why are you suspending " + name + "? (They will lose all admin access until you reinstate them.)");
        if (reason === null) return;

        result = await db.rpc("admin_suspend_staff", { p_user: id, p_reason: reason });
    } else if (event.target.closest(".staff-reinstate")) {
        if (!confirm("Give " + name + " their admin access back?")) return;

        result = await db.rpc("admin_reinstate_staff", { p_user: id });
    } else if (event.target.closest(".staff-remove")) {
        if (!confirm("Remove " + name + " from the admin team? They will become a normal member.")) return;

        result = await db.rpc("admin_remove_staff", { p_user: id });
    }

    if (!result) return;

    if (result.error) {
        alert(result.error.message);
        return;
    }

    await Promise.all([loadStaff(), loadAudit()]);
});

// ---------- Activity log ----------

async function loadAudit() {
    const { data, error } = await db.rpc("admin_audit_list");
    const list = document.getElementById("auditList");

    if (error) {
        list.innerHTML = "<p class='meta'>Could not load the log.</p>";
        return;
    }

    if (data.length === 0) {
        list.innerHTML = "<p class='meta'>Nothing yet.</p>";
        return;
    }

    list.innerHTML = data.map(function (a) {
        return "<p class='audit-row'><strong>" + escapeHTML(a.actor_name || "Someone") + "</strong> " +
            escapeHTML(a.action) + " <strong>" + escapeHTML(a.target_name || "") + "</strong>" +
            (a.details ? "<br><span class='meta'>" + escapeHTML(a.details) + "</span>" : "") +
            "<br><span class='meta'>" + new Date(a.created_at).toLocaleString() + "</span></p>";
    }).join("");
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();


// ---------- Two-step login for admins ----------

let mfaRequired = false;

async function loadMfaPanel() {
    const status = await db.rpc("mfa_status");
    const overview = await db.rpc("admin_mfa_overview");

    if (status.error || !status.data || !status.data[0]) {
        document.getElementById("mfaState").textContent = "Not set up yet. Run supabase-mfa.sql in Supabase.";
        document.getElementById("mfaToggle").style.display = "none";
        return;
    }

    mfaRequired = !!status.data[0].required;
    const mine = !!status.data[0].has_factor;

    document.getElementById("mfaState").textContent = mfaRequired
        ? "Required: every admin must log in with a code."
        : "Not required yet. Admins who turned it on use it, others do not need it.";

    const rows = overview.data || [];
    document.getElementById("mfaList").innerHTML = rows.map(function (r) {
        return '<p class="funnel-row"><span>' + escapeHTML(r.full_name || "Admin") + "</span><strong>" + (r.has_factor ? "On" : "Off") + "</strong></p>";
    }).join("");

    const button = document.getElementById("mfaToggle");
    button.textContent = mfaRequired ? "Stop requiring two-step login" : "Require two-step login for all admins";

    if (!mfaRequired && !mine) {
        document.getElementById("mfaToggleMsg").textContent = "First turn on your own two-step login in Settings, Account and privacy.";
        document.getElementById("mfaToggleMsg").className = "msg error";
    }
}

document.getElementById("mfaToggle").addEventListener("click", async function () {
    const turnOn = !mfaRequired;

    if (turnOn && !confirm("Every admin will need an authenticator app to use admin powers. Admins who have not set it up will be locked out of admin tools until they do. Continue?")) return;

    const { error } = await db.rpc("set_require_admin_mfa", { p_on: turnOn });
    const box = document.getElementById("mfaToggleMsg");

    box.textContent = error ? error.message : turnOn ? "Done. Two-step login is now required." : "Done. It is no longer required.";
    box.className = "msg " + (error ? "error" : "ok");

    await loadMfaPanel();
});