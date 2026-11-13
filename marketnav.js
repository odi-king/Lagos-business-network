// The Market section: Browse, My trades, My business. Also the lock screen for people without marketplace access.

(function () {
    const slot = document.getElementById("marketNav");
    if (!slot) return;

    const page = window.location.pathname.split("/").pop() || "feed.html";
    const items = [
        { href: "feed.html", label: "Browse", pages: ["feed.html"] },
        { href: "trades.html", label: "My trades", pages: ["trades.html", "trade.html"] },
        { href: "analytics.html", label: "My business", pages: ["analytics.html"] }
    ];

    slot.innerHTML = '<div class="subnav">' + items.map(function (item) {
        return '<a href="' + item.href + '" class="subnav-link' + (item.pages.indexOf(page) !== -1 ? " active" : "") + '">' + item.label + "</a>";
    }).join("") + "</div>";
})();

// Shown instead of the Market pages to anyone who cannot use the marketplace yet
function showMarketLock(profile) {
    const main = document.querySelector("main");
    const waiting = profile && (profile.role === "lecturer" || profile.role === "business");

    main.innerHTML =
        '<div class="panel lock-card"><h1>Marketplace</h1>' +
        "<p><strong>" + (waiting ? "The marketplace opens when your account is approved." : "The marketplace opens when you graduate.") + "</strong></p>" +
        "<p class='meta'>" + (waiting
            ? "The LBN team is checking your account. You will be told as soon as it is approved."
            : "Until then you can use Lifestyle, Reels and private messages, follow people and build your network, while you keep learning.") + "</p>" +
        '<a class="btn btn-primary" href="lifestyle.html">Go to Lifestyle</a> ' +
        (waiting ? "" : '<a class="btn btn-outline" href="dashboard.html">See my graduation progress</a>') + "</div>";
}

// Used by the trades pages: returns false (and shows the lock screen) if the marketplace is not open to this person
async function marketGate() {
    try {
        const { data } = await db.auth.getSession();
        if (!data.session) return true;

        const result = await db.from("profiles").select("role, approved, graduated, is_admin").eq("id", data.session.user.id).single();
        const p = result.data || {};

        const open = !!(p.is_admin ||
            (p.role === "lecturer" && p.approved) ||
            (p.role === "student" && p.graduated) ||
            (p.role === "business" && p.approved));

        if (!open) {
            showMarketLock(p);
            return false;
        }
    } catch (error) {}

    return true;
}