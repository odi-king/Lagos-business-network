let people = [];

const peopleList = document.getElementById("peopleList");
const adminSearch = document.getElementById("adminSearch");
const adminFilter = document.getElementById("adminFilter");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isPaid(person) {
    return !!person.paid_until && new Date(person.paid_until) > new Date();
}

async function init() {
    if (!db) {
        peopleList.innerHTML = "<p>Supabase is not connected yet. Check supabase-config.js.</p>";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    const me = await db
        .from("profiles")
        .select("is_admin")
        .eq("id", data.session.user.id)
        .maybeSingle();

    if (!me.data || !me.data.is_admin) {
        document.querySelector("main").innerHTML = `
            <section class="panel">
                <h2>Admins only</h2>
                <p class="meta">This page is only for the site owner.</p>
                <a href="dashboard.html" class="btn btn-primary" style="margin-top:10px;">Back to dashboard</a>
            </section>`;
        return;
    }

    await loadPeople();
}

async function loadPeople() {
    const { data, error } = await db.rpc("admin_people");

    if (error) {
        peopleList.innerHTML = "<p>Could not load people. " + escapeHTML(error.message) + "</p>";
        return;
    }

    people = data;
    renderStats();
    renderPeople();
}

function renderStats() {
    const waiting = people.filter(function (p) { return p.role === "lecturer" && !p.approved; }).length;
    const paid = people.filter(isPaid).length;
    const graduates = people.filter(function (p) { return p.role === "student" && p.graduated; }).length;

    const items = [
        { label: "Members", value: people.length },
        { label: "Paid members", value: paid },
        { label: "Lecturers waiting", value: waiting },
        { label: "Graduates", value: graduates }
    ];

    document.getElementById("adminStats").innerHTML = items.map(function (item) {
        return '<div class="card"><div class="stat">' + item.value + '</div><p>' + item.label + '</p></div>';
    }).join("");
}

function renderPeople() {
    const search = adminSearch.value.toLowerCase();
    const filter = adminFilter.value;

    const visible = people.filter(function (p) {
        const text = [p.full_name, p.email, p.institution].join(" ").toLowerCase();
        if (!text.includes(search)) return false;

        if (filter === "waiting") return p.role === "lecturer" && !p.approved;
        if (filter === "lecturers") return p.role === "lecturer";
        if (filter === "students") return p.role === "student";
        if (filter === "graduates") return p.role === "student" && p.graduated;
        if (filter === "unpaid") return !isPaid(p);
        return true;
    });

    if (visible.length === 0) {
        peopleList.innerHTML = "<p class='meta'>Nobody here.</p>";
        return;
    }

    peopleList.innerHTML = "";

    visible.forEach(function (p) {
        const card = document.createElement("div");
        card.className = "business-card";

        const isLecturer = p.role === "lecturer";
        const statusBadge = isLecturer
            ? (p.approved ? "Verified lecturer" : "Waiting for approval")
            : (p.graduated ? "Graduate" : "Student");

        const roleButton = isLecturer
            ? (p.approved
                ? '<button type="button" class="delete-btn" data-action="unapprove" data-id="' + escapeHTML(p.id) + '">Remove approval</button>'
                : '<button type="button" class="contact-btn" data-action="approve" data-id="' + escapeHTML(p.id) + '">Approve lecturer</button>')
            : (p.graduated
                ? '<button type="button" class="delete-btn" data-action="ungraduate" data-id="' + escapeHTML(p.id) + '">Undo graduation</button>'
                : '<button type="button" class="contact-btn" data-action="graduate" data-id="' + escapeHTML(p.id) + '">Graduate student</button>');

        const paidText = isPaid(p)
            ? "Paid until " + new Date(p.paid_until).toLocaleDateString()
            : "Not paid";

        card.innerHTML = `
            <h3>${escapeHTML(p.full_name || "No name")}
                <span class="badge ${isLecturer ? "lecturer" : ""}">${statusBadge}</span>
            </h3>
            <p class="meta">${escapeHTML(p.email)}</p>
            ${p.institution ? '<p class="meta">School: ' + escapeHTML(p.institution) + "</p>" : ""}
            <p class="meta">Joined ${new Date(p.created_at).toLocaleDateString()} &bull; ${paidText}</p>
            ${roleButton}
            <button type="button" class="btn btn-outline" data-action="grant" data-id="${escapeHTML(p.id)}">Give 1 year access</button>
        `;

        peopleList.appendChild(card);
    });
}

peopleList.addEventListener("click", async function (event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    const person = people.find(function (p) { return p.id === id; });
    const name = person ? (person.full_name || person.email) : "this person";

    const messages = {
        approve: "Approve " + name + " as a verified lecturer?",
        unapprove: "Remove " + name + "'s lecturer approval?",
        graduate: "Graduate " + name + " and open the marketplace for them?",
        ungraduate: "Undo graduation for " + name + "?",
        grant: "Give " + name + " one year of free membership?"
    };

    if (!confirm(messages[action])) return;

    button.disabled = true;
    let result;

    if (action === "approve") result = await db.rpc("admin_set_flags", { target: id, set_approved: true });
    if (action === "unapprove") result = await db.rpc("admin_set_flags", { target: id, set_approved: false });
    if (action === "graduate") result = await db.rpc("admin_set_flags", { target: id, set_graduated: true });
    if (action === "ungraduate") result = await db.rpc("admin_set_flags", { target: id, set_graduated: false });
    if (action === "grant") result = await db.rpc("admin_grant_membership", { target: id, add_days: 365 });

    if (result && result.error) {
        alert("Could not do that: " + result.error.message);
        button.disabled = false;
        return;
    }

    await loadPeople();
});

adminSearch.addEventListener("input", renderPeople);
adminFilter.addEventListener("change", renderPeople);

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();