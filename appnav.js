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
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
        send: '<path d="M22 3L11 14"/><path d="M22 3l-7 19-4-8-8-4z"/>'
    };

    function svg(name, size) {
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + "</svg>";
    }

    // ----- Bottom menu -----
    const tabs = [
        { href: "feed.html", label: "Home", icon: "market", pages: ["feed.html", "marketplace.html", "library.html", "post.html"] },
        { href: "reels.html", label: "Reels", icon: "reels", pages: ["reels.html"] },
        { href: "classes.html", label: "Classes", icon: "classes", pages: ["classes.html", "class.html", "live.html"] },
        { href: "trades.html", label: "Trades", icon: "trades", pages: ["trades.html", "trade.html"] },
        { href: "member.html", label: "Me", icon: "me", pages: ["member.html", "dashboard.html", "admin.html", "settings.html", "notifications.html", "messages.html", "chat.html"] }
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
            '<a href="messages.html" class="icon-link" aria-label="Messages">' + svg("send", 24) +
            '<span class="bell-badge" id="dmBadge" style="display:none;"></span></a>' +
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

    async function refreshDm() {
        if (typeof db === "undefined" || !db) return;

        // Having the app open means messages sent to you have been Delivered
        db.rpc("mark_dm_delivered").then(function () {}, function () {});
        db.rpc("mark_trade_delivered").then(function () {}, function () {});

        try {
            const { data, error } = await db.rpc("dm_unread_count");
            const badge = document.getElementById("dmBadge");
            if (error || !badge) return;

            if (data > 0) {
                badge.textContent = data > 9 ? "9+" : String(data);
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        } catch (e) {}
    }

    window.refreshDm = refreshDm;
    refreshDm();

    // A slim bar when the free trial or membership is close to ending
    async function showMembershipBanner() {
        if (typeof db === "undefined" || !db) return;
        if (/pay\.html$/.test(window.location.pathname)) return;

        let info = null;

        try {
            const { data, error } = await db.rpc("membership_info");
            if (error || !data || !data[0]) return;
            info = data[0];
        } catch (e) {
            return;
        }

        if (info.is_admin) return;

        // Reminders are saved as notifications, at most once a day from here
        const today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem("lbn_remind_day") !== today) {
            localStorage.setItem("lbn_remind_day", today);
            db.rpc("check_my_membership").then(function () {
                if (window.refreshBell) window.refreshBell();
            }, function () {});
        }

        const days = info.days_left;
        let text = "";

        if (info.active && info.is_trial) {
            text = days <= 7
                ? "Your free trial ends in " + days + (days === 1 ? " day." : " days.")
                : "Free trial: " + days + " days left.";
        } else if (info.active && days !== null && days <= 14) {
            text = "Your membership ends in " + days + (days === 1 ? " day." : " days.");
        } else if (!info.active && info.paid_until) {
            text = "Your membership has ended.";
        }

        if (!text) return;

        // The bar can be closed for the day, except in the last 3 days
        if (days > 3 && localStorage.getItem("lbn_bar_closed") === today) return;

        const nav = document.querySelector(".nav");
        if (!nav || document.getElementById("memberBar")) return;

        const bar = document.createElement("div");
        bar.id = "memberBar";
        bar.className = "member-bar" + (days <= 3 ? " urgent" : "");
        bar.innerHTML = "<span><span>" + text + "</span> <span>Pay \u20A620,000 for a full year to keep your benefits.</span></span>" +
            '<a class="btn btn-primary" href="pay.html">Pay now</a>' +
            (days > 3 ? '<button type="button" class="plain-btn" aria-label="Close">&times;</button>' : "");

        nav.insertAdjacentElement("afterend", bar);

        const close = bar.querySelector("button");
        if (close) {
            close.addEventListener("click", function () {
                localStorage.setItem("lbn_bar_closed", today);
                bar.remove();
            });
        }
    }

    showMembershipBanner();

    async function showDeactivatedBar() {
        if (typeof db === "undefined" || !db) return;

        try {
            const { data, error } = await db.rpc("my_account_state");
            if (error || data !== "deactivated") return;

            const nav = document.querySelector(".nav");
            if (!nav || document.getElementById("deactivatedBar")) return;

            const bar = document.createElement("div");
            bar.id = "deactivatedBar";
            bar.className = "member-bar urgent";
            bar.innerHTML = "<span>Your account is deactivated, so other members cannot see you.</span>" +
                '<button type="button" class="btn btn-primary">Reactivate</button>';

            nav.insertAdjacentElement("afterend", bar);

            bar.querySelector("button").addEventListener("click", async function () {
                await db.rpc("reactivate_my_account");
                bar.remove();
            });
        } catch (e) {}
    }

    showDeactivatedBar();

    window.refreshBell = refreshBell;
    refreshBell();

    setInterval(function () {
        if (!document.hidden) {
            refreshBell();
            refreshDm();
        }
    }, 60000);
})();