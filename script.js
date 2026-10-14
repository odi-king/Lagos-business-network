const exploreBtn = document.getElementById("exploreBtn");

exploreBtn.addEventListener("click", function() {
    alert("Welcome to Lagos Business Network! Let's discover businesses together.");
});


const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const businessCards = document.querySelectorAll(".business-card");

function filterBusinesses() {
    const searchText = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    businessCards.forEach(function (card) {
        const businessName = card.querySelector("h3").textContent.toLowerCase();
        const categoryText = card.querySelector("p").textContent.toLowerCase();

        const matchesSearch = businessName.includes(searchText);
        const matchesCategory =
            selectedCategory === "all" ||
            categoryText.includes(selectedCategory);

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

    alert("Business registered successfully!");
    businessForm.reset();
});


