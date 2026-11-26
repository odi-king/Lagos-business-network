// LBN Phase 14A: the ONE central Admin home. Tiles open the existing admin screens (no copies), filtered by area.
(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

    const TILES = [
        { title: "User management", text: "Approve lecturers and businesses, verify traders, graduate students, free access.", href: "admin.html?area=members", perm: "members" },
        { title: "Finance", text: "Payments, payouts, refunds, fees, billing and international payments.", href: "admin.html?area=finance", perm: "finance" },
        { title: "Marketplace", text: "Trades, disputes, reviews and reports.", href: "admin.html?area=marketplace", perm: "marketplace" },
        { title: "Education", text: "Graduation requests and requirements.", href: "admin.html?area=education", perm: "education" },
        { title: "Content", text: "Posts, comments and handouts that break the rules.", href: "admin.html?area=content", perm: "content" },
        { title: "Support and operations", text: "Customer care messages, feedback and daily operations.", href: "admin.html?area=support", perm: "support" },
        { title: "Ambassadors", text: "School ambassadors, stipends and monitoring.", href: "ambassador-admin.html", perm: "members" },
        { title: "Representatives", text: "Country representatives, meetings and business leads.", href: "representatives-admin.html", perm: "members" },
        { title: "Security and technical", text: "Security checks, logins, threats, files, legal records.", href: "security.html", perm: "security" },
        { title: "Audit log", text: "One record of what administrators did.", href: "audit-log.html", perm: "security" },
        { title: "Admin team", text: "Appoint administrators and set their permissions. Super Admin only.", href: "admins.html", perm: "@super" },
        { title: "Everything (full page)", text: "The complete admin page with every panel you are allowed to use.", href: "admin.html?area=all", perm: "@any" }
    ];

    async function init() {
        const s = await db.auth.getSession();
        if (!s.data.session) { location.href = "auth.html?next=admin-home.html"; return; }

        const r = await db.rpc("my_admin_access");
        const row = r.data && r.data[0];
        const isSuper = !!(row && row.is_super) || !!r.error;
        const perms = (row && row.permissions) || [];
        const status = row ? row.status : "none";

        if (!isSuper && status !== "active") {
            el("pgMsg").textContent = "This page is only for the LBN admin team.";
            el("pgMsg").className = "msg error";
            return;
        }

        const show = TILES.filter(function (t) {
            if (t.perm === "@any") return true;
            if (t.perm === "@super") return isSuper;
            return isSuper || perms.indexOf(t.perm) !== -1;
        });

        el("tiles").innerHTML = show.map(function (t) {
            return '<a class="panel" href="' + esc(t.href) + '" style="display:block;text-decoration:none;color:inherit;"><h3 style="margin:0 0 6px;">' + esc(t.title) + '</h3><p class="meta" style="margin:0;">' + esc(t.text) + '</p></a>';
        }).join("");
    }

    init();
})();