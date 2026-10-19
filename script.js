const exploreBtn = document.getElementById("exploreBtn");

exploreBtn.addEventListener("click", function() {
    alert("Welcome to Lagos Business Network! Let's discover businesses together.");
});


const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");


function filterBusinesses() {
    const businessCards = document.querySelectorAll(".business-card");
    const searchText = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    businessCards.forEach(function (card) {
        const businessName = card.querySelector("h3").textContent.toLowerCase();

const categoryParagraph = Array.from(card.querySelectorAll("p"))
    .find(p => p.textContent.toLowerCase().startsWith("category:"));

const categoryText = categoryParagraph
    ? categoryParagraph.textContent.replace("category:", "").trim().toLowerCase()
    : "";

const matchesSearch = businessName.includes(searchText);

const matchesCategory =
    selectedCategory.toLowerCase() === "all" ||
    categoryText === selectedCategory.toLowerCase();

        card.style.display =
            matchesSearch && matchesCategory ? "block" : "none";
    });
}

searchInput.addEventListener("input", filterBusinesses);
categoryFilter.addEventListener("change", filterBusinesses);

const businessForm = document.getElementById("businessForm");

businessForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const business = {
        name: document.getElementById("businessName").value.trim(),
        category: document.getElementById("businessCategory").value.trim(),
        location: document.getElementById("businessLocation").value.trim(),
        phone: document.getElementById("businessPhone").value.trim(),
        email: document.getElementById("businessEmail").value.trim()
    };

    const businesses = JSON.parse(
        localStorage.getItem("registeredBusinesses") || "[]"
    );

    businesses.push(business);

    localStorage.setItem(
        "registeredBusinesses",
        JSON.stringify(businesses)
    );

    displayRegisteredBusinesses();

    alert("Business registered successfully!");
    businessForm.reset();
});
function displayRegisteredBusinesses() {
    const businessList = document.getElementById("registeredBusinessList");

    const businesses = JSON.parse(
        localStorage.getItem("registeredBusinesses") || "[]"
    );

    businessList.innerHTML = "";

    businesses.forEach(function (business) {
        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${business.name}</h3>
            <p>Category: ${business.category}</p>
            <p>Location: ${business.location}</p>
            <p>Phone: ${business.phone}</p>
            <p>Contact: ${business.email}</p>
            <a href="mailto:${business.email}" class="contact-btn">
                Contact Business
            </a>
        `;

        businessList.appendChild(card);
    });
}

displayRegisteredBusinesses();


