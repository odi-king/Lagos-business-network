const exploreBtn = document.getElementById("exploreBtn");

exploreBtn.addEventListener("click", function() {
    alert("Welcome to Lagos Business Network! Let's discover businesses together.");
});

const searchInput = document.getElementById("searchInput");
const businessCards = document.querySelectorAll(".business-card");

searchInput.addEventListener("input", function () {
    const searchText = searchInput.value.toLowerCase();

    businessCards.forEach(function (card) {
        const businessName = card.querySelector("h3").textContent.toLowerCase();

        if (businessName.includes(searchText)) {
            card.style.display = "block";
        } else {
            card.style.display = "none";
        }
    });
});

