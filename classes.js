let currentUser = null;
let profile = null;
let allClasses = [];

const classList = document.getElementById("classList");
const classSearch = document.getElementById("classSearch");
const fieldFilter = document.getElementById("fieldFilter");
const classForm = document.getElementById("classForm");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function init() {
    if (!db) {
        classList.innerHTML = "<p>Supabase is not connected yet. Check supabase-config.js.</p>";
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    if (!(await hasActiveMembership(currentUser.id))) {
        window.location.href = "pay.html";
        return;
    }

    const result = await db
        .from("profiles")
        .select("role, approved")
        .eq("id", currentUser.id)
        .single();

    profile = result.data;

    if (profile && profile.role === "lecturer") {
        if (profile.approved) {
            document.getElementById("createPanel").style.display = "block";
        } else {
            document.getElementById("pageNote").textContent =
                "Your lecturer account is waiting for approval. You can create classes once it is approved.";
        }
    }

    await loadClasses();
}

async function loadClasses() {
    const { data, error } = await db
        .from("classes")
        .select("*, profiles(full_name, institution, role, approved, verified, is_admin)")
        .order("created_at", { ascending: false });

    if (error) {
        classList.innerHTML = "<p>Could not load classes. " + escapeHTML(error.message) + "</p>";
        return;
    }

    allClasses = data;
    buildFieldFilter();
    renderClasses();
}

// The field list is built from the classes lecturers have created
function buildFieldFilter() {
    const keep = fieldFilter.value;
    const fields = {};

    allClasses.forEach(function (item) {
        const key = item.field.trim().toLowerCase();
        if (!fields[key]) fields[key] = item.field.trim();
    });

    fieldFilter.innerHTML = '<option value="all">All fields</option>';

    Object.keys(fields).sort().forEach(function (key) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = fields[key];
        fieldFilter.appendChild(option);
    });

    fieldFilter.value = fields[keep] ? keep : "all";
}

function renderClasses() {
    const search = classSearch.value.toLowerCase();
    const field = fieldFilter.value;

    const visible = allClasses.filter(function (item) {
        const lecturer = item.profiles ? item.profiles.full_name || "" : "";
        const matchesSearch =
            item.title.toLowerCase().includes(search) ||
            lecturer.toLowerCase().includes(search);
        const matchesField = field === "all" || item.field.trim().toLowerCase() === field;
        return matchesSearch && matchesField;
    });

    if (visible.length === 0) {
        classList.innerHTML = "<p class='meta'>No classes found yet.</p>";
        return;
    }

    classList.innerHTML = "";

    visible.forEach(function (item) {
        const lecturer = item.profiles && item.profiles.full_name ? item.profiles.full_name : "Lecturer";
        const institution = item.profiles && item.profiles.institution ? item.profiles.institution : "";
        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${escapeHTML(item.title)}</h3>
            <p><span class="badge lecturer" style="margin-left:0;">${escapeHTML(item.field)}</span></p>
            <p class="meta">Taught by ${escapeHTML(lecturer)} ${badgeHTML(item.profiles)}</p>
            ${institution ? `<p class="meta">${escapeHTML(institution)}</p>` : ""}
            <p>${escapeHTML(item.description)}</p>
            <a href="class.html?id=${encodeURIComponent(item.id)}" class="contact-btn">Open class</a>
        `;

        classList.appendChild(card);
    });
}

classSearch.addEventListener("input", renderClasses);
fieldFilter.addEventListener("change", renderClasses);

classForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const button = classForm.querySelector("button[type='submit']");
    button.disabled = true;

    const { error } = await db.from("classes").insert({
        title: document.getElementById("className").value.trim(),
        field: document.getElementById("classField").value.trim(),
        description: document.getElementById("classDesc").value.trim()
    });

    button.disabled = false;

    if (error) {
        alert("Could not create the class: " + error.message);
        return;
    }

    classForm.reset();
    await loadClasses();
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();