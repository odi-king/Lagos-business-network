const notifList = document.getElementById("notifList");
const notifNote = document.getElementById("notifNote");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function timeAgo(value) {
    const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");

    const days = Math.floor(hours / 24);
    if (days < 30) return days + (days === 1 ? " day ago" : " days ago");

    return new Date(value).toLocaleDateString();
}

// Only links to pages on this site are allowed
function safeLink(link) {
    return link && /^[a-z0-9_-]+\.html([?#][a-zA-Z0-9=&_%.#-]*)?$/i.test(link) ? link : "feed.html";
}

async function loadNotifications() {
    const { data, error } = await db.rpc("my_notifications", { p_limit: 60 });

    if (error) {
        notifNote.textContent = "Could not load notifications. " + error.message;
        return;
    }

    if (data.length === 0) {
        notifList.innerHTML = "";
        notifNote.textContent = "Nothing yet. When someone follows you, comments, messages you or buys from you, it shows up here.";
        return;
    }

    notifNote.textContent = "";
    notifList.innerHTML = "";

    data.forEach(function (n) {
        const row = document.createElement("a");
        row.className = "notif" + (n.read ? "" : " unread");
        row.href = safeLink(n.link);
        row.dataset.id = n.id;

        row.innerHTML =
            "<strong>" + escapeHTML(n.title) + "</strong>" +
            (n.body ? "<div>" + escapeHTML(n.body) + "</div>" : "") +
            '<div class="post-time">' + timeAgo(n.created_at) + "</div>";

        notifList.appendChild(row);
    });
}

// Opening one marks it as read
notifList.addEventListener("click", function (event) {
    const row = event.target.closest(".notif");
    if (!row) return;

    db.rpc("mark_notifications_read", { p_id: row.dataset.id });
});

document.getElementById("readAll").addEventListener("click", async function () {
    await db.rpc("mark_notifications_read", { p_id: null });
    await loadNotifications();
    if (window.refreshBell) window.refreshBell();
});

async function init() {
    if (!db) {
        notifNote.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("notifications.html");
        return;
    }

    await loadNotifications();
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();