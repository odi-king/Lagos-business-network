let currentUser = null;
let profile = null;

const welcomeText = document.getElementById("welcomeText");
const roleBadge = document.getElementById("roleBadge");
const handoutList = document.getElementById("handoutList");
const handoutForm = document.getElementById("handoutForm");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatPrice(price) {
    return price > 0 ? "\u20A6" + Number(price).toLocaleString() : "Free";
}

async function init() {
    if (!db) {
        welcomeText.textContent = "Supabase is not connected yet. Check supabase-config.js.";
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
        .select("full_name, role, approved")
        .eq("id", currentUser.id)
        .single();

    if (result.error || !result.data) {
        welcomeText.textContent = "We could not load your profile. Make sure you ran the SQL files in Supabase.";
        return;
    }

    profile = result.data;
    showRole();
    await loadHandouts();
}

function showRole() {
    const name = profile.full_name || currentUser.email;
    const isLecturer = profile.role === "lecturer";

    welcomeText.textContent = "Welcome, " + name + ".";

    if (isLecturer) {
        roleBadge.textContent = profile.approved ? "Lecturer" : "Lecturer (pending)";
        roleBadge.className = "badge lecturer";
        document.getElementById("pendingNotice").style.display = profile.approved ? "none" : "block";
        document.getElementById("lecturerPanel").style.display = profile.approved ? "block" : "none";
    } else {
        roleBadge.textContent = "Student";
        roleBadge.className = "badge";
        document.getElementById("studentPanel").style.display = "block";
    }
}

async function loadHandouts() {
    const { data, error } = await db
        .from("handouts")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false });

    if (error) {
        handoutList.innerHTML = "<p>Could not load the library. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        handoutList.innerHTML = "<p class='meta'>Nothing here yet.</p>";
        return;
    }

    handoutList.innerHTML = "";

    data.forEach(function (item) {
        const card = document.createElement("div");
        card.className = "business-card";

        const lecturerName = item.profiles ? item.profiles.full_name : "Lecturer";
        const deleteButton = item.lecturer_id === currentUser.id
            ? '<button type="button" class="delete-btn" data-id="' + escapeHTML(item.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(item.title)}</h3>
            <p class="meta">${escapeHTML(item.kind)} by ${escapeHTML(lecturerName)}</p>
            <p>${escapeHTML(item.description)}</p>
            <p><strong>${formatPrice(item.price)}</strong></p>
            ${deleteButton}
        `;

        handoutList.appendChild(card);
    });
}

if (handoutForm) {
    handoutForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = handoutForm.querySelector("button[type='submit']");
        submitButton.disabled = true;

        const { error } = await db.from("handouts").insert({
            title: document.getElementById("handoutTitle").value.trim(),
            kind: document.getElementById("handoutKind").value,
            price: Number(document.getElementById("handoutPrice").value),
            description: document.getElementById("handoutDesc").value.trim()
        });

        submitButton.disabled = false;

        if (error) {
            alert("Could not add it: " + error.message);
            return;
        }

        handoutForm.reset();
        await loadHandouts();
    });
}

handoutList.addEventListener("click", async function (event) {
    const button = event.target.closest(".delete-btn");
    if (!button) return;

    if (!confirm("Delete this item?")) return;

    const { data, error } = await db
        .from("handouts")
        .delete()
        .eq("id", button.dataset.id)
        .select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this item.");
        return;
    }

    await loadHandouts();
});

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();