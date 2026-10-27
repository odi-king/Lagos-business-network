// Phone navigation: a bottom menu (Market, Reels, Classes, Trades, Me)
// and, at the top, a bell for notifications and a menu for settings.

(function () {
    const page = window.location.pathname.split("/").pop() || "index.html";

    const icons = {
        market: '<path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M9 20v-6h6v6"/>',
        reels: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>',
        classes: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
        trades: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
        me: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
    };

    function svg(name, size) {
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + "</svg>";
    }

    // ----- Bottom menu -----
    const tabs = [
        { href: "feed.html", label: "Market", icon: "market", pages: ["feed.html", "marketplace.html", "library.html"] },
        { href: "reels.html", label: "Reels", icon: "reels", pages: ["reels.html"] },
        { href: "classes.html", label: "Classes", icon: "classes", pages: ["classes.html", "class.html", "live.html"] },
        { href: "trades.html", label: "Trades", icon: "trades", pages: ["trades.html", "trade.html"] },
        { href: "member.html", label: "Me", icon: "me", pages: ["member.html", "dashboard.html", "admin.html", "settings.html", "notifications.html"] }
    ];

    const bar = document.createElement("nav");
    bar.className = "bottom-nav";
    bar.setAttribute("aria-label", "Main menu");

    bar.innerHTML = tabs.map(function (tab) {
        const active = tab.pages.indexOf(page) !== -1 ? " active" : "";
        return '<a href="' + tab.href + '" class="bottom-tab' + active + '">' + svg(tab.icon, 24) + "<span>" + tab.label + "</span></a>";
    }).join("");

    document.body.appendChild(bar);
    document.body.classList.add("has-bottom-nav");

    // ----- Bell and settings at the top -----
    const container = document.querySelector(".nav .container");

    if (container && !container.querySelector(".nav-actions")) {
        const actions = document.createElement("div");
        actions.className = "nav-actions";
        actions.innerHTML =
            '<a href="notifications.html" class="icon-link" aria-label="Notifications">' + svg("bell", 24) +
            '<span class="bell-badge" id="bellBadge" style="display:none;"></span></a>' +
            '<a href="settings.html" class="icon-link" aria-label="Settings and activity">' + svg("menu", 24) + "</a>";
        container.appendChild(actions);
    }

    async function refreshBell() {
        if (typeof db === "undefined" || !db) return;

        try {
            const { data, error } = await db.rpc("my_unread_count");
            const badge = document.getElementById("bellBadge");
            if (error || !badge) return;

            if (data > 0) {
                badge.textContent = data > 9 ? "9+" : String(data);
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        } catch (e) {}
    }

    window.refreshBell = refreshBell;
    refreshBell();

    setInterval(function () {
        if (!document.hidden) refreshBell();
    }, 60000);
})();