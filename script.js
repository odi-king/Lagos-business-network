let currentUser = null;
let allBusinesses = [];

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const businessForm = document.getElementById("businessForm");
const businessList = document.getElementById("registeredBusinessList");

// Stops user-typed text from being treated as HTML
function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------- Start: only logged-in people can see this page ----------

async function init() {
    if (!db) {
        businessList.innerHTML = "<p>Supabase is not connected yet. Paste your Project URL and anon key into supabase-config.js, then refresh.</p>";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    const welcome = document.getElementById("welcomeText");
    if (welcome) {
        const name = currentUser.user_metadata.full_name || currentUser.email;
        welcome.textContent = "Welcome, " + name + ". Register your business and find others to work with.";
    }

    await loadBusinesses();
}

// ---------- Load and show businesses ----------

async function loadBusinesses() {
    const { data, error } = await db
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        businessList.innerHTML = "<p>Could not load businesses. " + escapeHTML(error.message) + "</p>";
        return;
    }

    allBusinesses = data;
    renderBusinesses();
}

function renderBusinesses() {
    const searchText = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value.toLowerCase();

    const visible = allBusinesses.filter(function (business) {
        const matchesSearch = business.name.toLowerCase().includes(searchText);
        const matchesCategory =
            selectedCategory === "all" ||
            business.category.toLowerCase() === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    if (visible.length === 0) {
        businessList.innerHTML = "<p>No businesses found.</p>";
        return;
    }

    businessList.innerHTML = "";

    visible.forEach(function (business) {
        const card = document.createElement("div");
        card.className = "business-card";

        // Only the owner sees the delete button
        const deleteButton = business.owner_id === currentUser.id
            ? '<button type="button" class="delete-btn" data-id="' + escapeHTML(business.id) + '">Delete Business</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(business.name)}</h3>
            <p>Category: ${escapeHTML(business.category)}</p>
            <p>Location: ${escapeHTML(business.location)}</p>
            <p>Phone: ${escapeHTML(business.phone)}</p>
            <p>Contact: ${escapeHTML(business.email)}</p>
            <a href="mailto:${escapeHTML(business.email)}" class="contact-btn">Email Business</a>
            <a href="tel:${escapeHTML(business.phone)}" class="contact-btn">Call Business</a>
            ${deleteButton}
        `;

        businessList.appendChild(card);
    });
}

searchInput.addEventListener("input", renderBusinesses);
categoryFilter.addEventListener("change", renderBusinesses);

// ---------- Register a business ----------

businessForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const submitButton = businessForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    const business = {
        owner_id: currentUser.id,
        name: document.getElementById("businessName").value.trim(),
        category: document.getElementById("businessCategory").value.trim(),
        location: document.getElementById("businessLocation").value.trim(),
        phone: document.getElementById("businessPhone").value.trim(),
        email: document.getElementById("businessEmail").value.trim()
    };

    const { error } = await db.from("businesses").insert(business);

    submitButton.disabled = false;

    if (error) {
        alert("Could not register business: " + error.message);
        return;
    }

    businessForm.reset();
    await loadBusinesses();
    alert("Business registered successfully!");
});

// ---------- Delete a business ----------

businessList.addEventListener("click", async function (event) {
    const button = event.target.closest(".delete-btn");
    if (!button) return;

    if (!confirm("Are you sure you want to delete this business?")) return;

    const { data, error } = await db
        .from("businesses")
        .delete()
        .eq("id", button.dataset.id)
        .select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this business.");
        return;
    }

    allBusinesses = allBusinesses.filter(function (business) {
        return business.id !== button.dataset.id;
    });
    renderBusinesses();
    alert("Business deleted successfully!");
});

// ---------- Log out ----------

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async function (event) {
        event.preventDefault();
        await db.auth.signOut();
        window.location.href = "auth.html";
    });
}

init();