const STORAGE_KEY = "registeredBusinesses";

// ---------- Helpers ----------

function getBusinesses() {
    try {
        const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function saveBusinesses(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// Stops user-typed text from being treated as HTML
function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Give old saved businesses (made before this update) a unique id
function ensureIds() {
    const list = getBusinesses();
    let changed = false;

    list.forEach(function (business, index) {
        if (!business.id) {
            business.id = Date.now() + "-" + index;
            changed = true;
        }
    });

    if (changed) {
        saveBusinesses(list);
    }
}

// ---------- Explore button ----------

const exploreBtn = document.getElementById("exploreBtn");

if (exploreBtn) {
    exploreBtn.addEventListener("click", function () {
        alert("Welcome to Lagos Business Network! Let's discover businesses together.");
    });
}

// ---------- Search and filter ----------

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

function filterBusinesses() {
    const businessCards = document.querySelectorAll(".business-card");
    const searchText = searchInput ? searchInput.value.toLowerCase() : "";
    const selectedCategory = categoryFilter ? categoryFilter.value.toLowerCase() : "all";

    businessCards.forEach(function (card) {
        const nameEl = card.querySelector("h3");
        const businessName = nameEl ? nameEl.textContent.toLowerCase() : "";

        const categoryParagraph = Array.from(card.querySelectorAll("p")).find(function (p) {
            return p.textContent.toLowerCase().startsWith("category:");
        });

        const categoryText = categoryParagraph
            ? categoryParagraph.textContent.replace(/category:/i, "").trim().toLowerCase()
            : "";

        const matchesSearch = businessName.includes(searchText);
        const matchesCategory =
            selectedCategory === "all" || categoryText === selectedCategory;

        card.style.display = matchesSearch && matchesCategory ? "block" : "none";
    });
}

if (searchInput) searchInput.addEventListener("input", filterBusinesses);
if (categoryFilter) categoryFilter.addEventListener("change", filterBusinesses);

// ---------- Show registered businesses ----------

function displayRegisteredBusinesses() {
    const businessList = document.getElementById("registeredBusinessList");
    if (!businessList) return;

    const businesses = getBusinesses();
    businessList.innerHTML = "";

    if (businesses.length === 0) {
        businessList.innerHTML = "<p>No businesses registered yet.</p>";
        return;
    }

    businesses.forEach(function (business) {
        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${escapeHTML(business.name)}</h3>
            <p>Category: ${escapeHTML(business.category)}</p>
            <p>Location: ${escapeHTML(business.location)}</p>
            <p>Phone: ${escapeHTML(business.phone)}</p>
            <p>Contact: ${escapeHTML(business.email)}</p>
            <a href="mailto:${escapeHTML(business.email)}" class="contact-btn">Email Business</a>
            <a href="tel:${escapeHTML(business.phone)}" class="contact-btn">Call Business</a>
            <button type="button" class="delete-btn" data-id="${escapeHTML(business.id)}">
                Delete Business
            </button>
        `;

        businessList.appendChild(card);
    });

    // Keep the current search/filter applied after re-rendering
    filterBusinesses();
}

// ---------- Delete a business ----------

function deleteBusiness(id) {
    if (!confirm("Are you sure you want to delete this business?")) return;

    const updated = getBusinesses().filter(function (business) {
        return String(business.id) !== String(id);
    });

    saveBusinesses(updated);
    displayRegisteredBusinesses();
    alert("Business deleted successfully!");
}

// One listener handles every delete button, even ones added later
const registeredBusinessList = document.getElementById("registeredBusinessList");

if (registeredBusinessList) {
    registeredBusinessList.addEventListener("click", function (event) {
        const button = event.target.closest(".delete-btn");
        if (button) {
            deleteBusiness(button.dataset.id);
        }
    });
}

// ---------- Register a business ----------

const businessForm = document.getElementById("businessForm");

if (businessForm) {
    businessForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const business = {
            id: Date.now().toString(),
            name: document.getElementById("businessName").value.trim(),
            category: document.getElementById("businessCategory").value.trim(),
            location: document.getElementById("businessLocation").value.trim(),
            phone: document.getElementById("businessPhone").value.trim(),
            email: document.getElementById("businessEmail").value.trim()
        };

        const businesses = getBusinesses();
        businesses.push(business);
        saveBusinesses(businesses);

        displayRegisteredBusinesses();
        alert("Business registered successfully!");
        businessForm.reset();
    });
}

// ---------- Start ----------

ensureIds();
displayRegisteredBusinesses();