function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function row(label, href) {
    return '<a class="settings-row" href="' + href + '"><span>' + label + '</span><span class="chev">\u203A</span></a>';
}

function section(title, rows) {
    return '<div class="settings-title">' + title + '</div><div class="menu">' + rows.join("") + "</div>";
}

async function init() {
    const statusBox = document.getElementById("statusBox");

    if (!db) {
        statusBox.innerHTML = "<p class='meta'>Supabase is not connected yet. Check supabase-config.js.</p>";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("settings.html");
        return;
    }

    const user = data.session.user;

    const profileResult = await db
        .from("profiles")
        .select("full_name, role, approved, graduated, verified, is_admin")
        .eq("id", user.id)
        .maybeSingle();

    const profile = profileResult.data || {};

    const membershipResult = await db
        .from("memberships")
        .select("paid_until")
        .eq("user_id", user.id)
        .maybeSingle();

    const paidUntil = membershipResult.data ? new Date(membershipResult.data.paid_until) : null;
    const paid = profile.is_admin || (paidUntil && paidUntil > new Date());

    let standing = "";

    if (profile.is_admin) {
        standing = "Administrator";
    } else if (profile.role === "lecturer") {
        standing = profile.approved ? "Verified lecturer" : "Lecturer, waiting for approval";
    } else {
        standing = profile.verified ? "Verified trader" : profile.graduated ? "Graduate" : "Student";
    }

    statusBox.innerHTML = `
        <h2>${escapeHTML(profile.full_name || user.email)}${badgeHTML(profile)}</h2>
        <p class="meta">${escapeHTML(user.email)}</p>
        <p><strong>Account status:</strong> ${escapeHTML(standing)}</p>
        <p><strong>Membership:</strong> ${paid
            ? (profile.is_admin ? "Full access" : "Active until " + paidUntil.toLocaleDateString())
            : 'Not active. <a href="pay.html" style="color: var(--accent);">Pay now</a>'}</p>
    `;

    const isLecturer = profile.role === "lecturer";
    const isStudent = profile.role === "student";

    const orders = [
        row("My trades", "trades.html"),
        row("My purchases", "library.html#purchases")
    ];
    if (isLecturer) orders.push(row("My sales", "library.html#sales"));
    orders.push(row("Payout account", "dashboard.html#payout"));

    const learning = [
        row("Classes", "classes.html"),
        row("Live classes", "live.html"),
        row("Handouts and books", "library.html")
    ];
    if (isStudent) learning.push(row("My path to graduation", "dashboard.html#graduationPanel"));

    const parts = [
        section("Your account", [
            row("Edit profile", "member.html?edit=1"),
            row("Notifications", "notifications.html"),
            row("Change password", "reset.html")
        ]),
        section("Your activity", [
            row("My profile and posts", "member.html"),
            row("Dashboard", "dashboard.html")
        ]),
        section("Orders and payments", orders),
        section("Learning", learning)
    ];

    if (profile.is_admin) {
        parts.push(section("Administrator", [row("Admin", "admin.html")]));
    }

    parts.push(section("More info and support", [
        row("Help", "help.html"),
        row("Customer care", "contact.html"),
        row("About Lagos Business Network", "index.html")
    ]));

    document.getElementById("settingsList").innerHTML = parts.join("");

    const logout = document.getElementById("logoutRow");
    logout.style.display = "";

    logout.addEventListener("click", async function () {
        await db.auth.signOut();
        window.location.href = "auth.html";
    });
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();