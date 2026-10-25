// A bottom menu on phones, like Instagram: Market, Reels, Classes, Trades, Me.

(function () {
    const page = window.location.pathname.split("/").pop() || "index.html";

    const icons = {
        market: '<path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M9 20v-6h6v6"/>',
        reels: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
        classes: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
        trades: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
        me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
    };

    const tabs = [
        { href: "feed.html", label: "Market", icon: "market", pages: ["feed.html", "marketplace.html"] },
        { href: "reels.html", label: "Reels", icon: "reels", pages: ["reels.html"] },
        { href: "classes.html", label: "Classes", icon: "classes", pages: ["classes.html", "class.html", "live.html"] },
        { href: "trades.html", label: "Trades", icon: "trades", pages: ["trades.html", "trade.html"] },
        { href: "member.html", label: "Me", icon: "me", pages: ["member.html", "dashboard.html", "admin.html"] }
    ];

    const bar = document.createElement("nav");
    bar.className = "bottom-nav";
    bar.setAttribute("aria-label", "Main menu");

    bar.innerHTML = tabs.map(function (tab) {
        const active = tab.pages.indexOf(page) !== -1 ? " active" : "";
        return '<a href="' + tab.href + '" class="bottom-tab' + active + '">' +
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            icons[tab.icon] + "</svg><span>" + tab.label + "</span></a>";
    }).join("");

    document.body.appendChild(bar);
    document.body.classList.add("has-bottom-nav");
})();