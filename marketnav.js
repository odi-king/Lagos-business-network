
// LBN Marketplace navigation and access screen.

(function () {
    const slot = document.getElementById("marketNav");
    if (!slot) return;

    const page = window.location.pathname.split("/").pop() || "feed.html";

    const items = [
        {
            href: "feed.html",
            label: "Browse",
            icon: "store",
            description: "",
            pages: ["feed.html"],
            featured: false
        },
        {
            href: "trades.html",
            label: "My trades",
            icon: "messages",
            description: "Manage your trades",
            pages: ["trades.html", "trade.html"],
            featured: true
        },
        {
            href: "analytics.html",
            label: "Business analytics",
            icon: "chart",
            description: "Track your business",
            pages: ["analytics.html"],
            featured: true
        }
    ];

    const icons = {
        store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v10h14V10M3 10l2-7h14l2 7M9 20v-6h6v6"/></svg>',
        messages: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/></svg>',
        chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M8 16v-4M13 16V7M18 16v-7"/></svg>'
    };

    slot.innerHTML =
        '<div class="lbn-market-nav">' +
        items.map(function (item) {
            const active = item.pages.includes(page);

            return '<a href="' + item.href + '" class="lbn-market-link' +
                (item.featured ? ' featured' : ' browse-link') +
                (active ? ' active' : '') + '"' +
                (active ? ' aria-current="page"' : '') + '>' +
                '<span class="lbn-market-icon">' + icons[item.icon] + '</span>' +
                '<span class="lbn-market-text">' +
                '<strong>' + item.label + '</strong>' +
                (item.description
                    ? '<small>' + item.description + '</small>'
                    : '') +
                '</span>' +
                (item.featured
                    ? '<span class="lbn-market-arrow">↗</span>'
                    : '') +
                '</a>';
        }).join("") +
        '</div>';
})();


// Shown to people who cannot access the marketplace yet.
function showMarketLock(profile) {
    const main = document.querySelector("main");
    const waiting = profile &&
        (profile.role === "lecturer" || profile.role === "business");

    main.innerHTML =
        '<div class="panel lock-card"><h1>Marketplace</h1>' +
        "<p><strong>" +
        (waiting
            ? "The marketplace opens when your account is approved."
            : "The marketplace opens when you graduate.") +
        "</strong></p>" +
        "<p class='meta'>" +
        (waiting
            ? "The LBN team is checking your account. You will be told as soon as it is approved."
            : "Until then you can use Lifestyle, Reels and private messages, follow people and build your network, while you keep learning.") +
        "</p>" +
        '<a class="btn btn-primary" href="lifestyle.html">Go to Lifestyle</a> ' +
        (waiting
            ? ""
            : '<a class="btn btn-outline" href="dashboard.html">See my graduation progress</a>') +
        "</div>";
}


// Marketplace access check for trades pages.
async function marketGate() {
    try {
        const { data } = await db.auth.getSession();
        if (!data.session) return true;

        const result = await db.from("profiles")
            .select("role, approved, graduated, is_admin")
            .eq("id", data.session.user.id)
            .single();

        if (result.error || !result.data) {
            showMarketLock({});
            return false;
        }

        const p = result.data;

        const open = !!(
            p.is_admin ||
            (p.role === "lecturer" && p.approved) ||
            (p.role === "student" && p.graduated) ||
            (p.role === "business" && p.approved)
        );

        if (!open) {
            showMarketLock(p);
            return false;
        }

        return true;
    } catch (error) {
        showMarketLock({});
        return false;
    }
}
