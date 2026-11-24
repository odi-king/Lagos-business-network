function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Only show links that start with http(s), as plain text links
function safeLinks(text) {
    return String(text || "").split(/\s+/).filter(function (t) { return /^https?:\/\//i.test(t); }).slice(0, 5).map(function (u) {
        return '<a href="' + escapeHTML(u) + '" target="_blank" rel="noopener noreferrer nofollow">' + escapeHTML(u.replace(/^https?:\/\//i, "").slice(0, 40)) + "</a>";
    }).join(" &bull; ");
}

async function load() {
    const celeb = document.getElementById("celebList");
    const glob = document.getElementById("globalList");

    if (!db) { celeb.innerHTML = glob.innerHTML = "<p class='meta'>Not available right now.</p>"; return; }

    const { data, error } = await db.rpc("public_brand_ambassadors");

    if (error) { celeb.innerHTML = glob.innerHTML = "<p class='meta'>Coming soon.</p>"; return; }

    function card(b) {
        return '<div class="staff-card"><strong>' + escapeHTML(b.display_name) + "</strong>" +
            '<div class="meta">' + escapeHTML(b.public_title) + (b.country ? " &bull; " + escapeHTML(b.country) : "") + "</div>" +
            (b.bio ? "<p>" + escapeHTML(b.bio) + "</p>" : "") +
            (b.links ? '<div class="meta">' + safeLinks(b.links) + "</div>" : "") + "</div>";
    }

    const c = data.filter(function (b) { return b.category === "celebrity"; });
    const g = data.filter(function (b) { return b.category === "global"; });
    celeb.innerHTML = c.length ? c.map(card).join("") : "<p class='meta'>Announcements coming soon.</p>";
    glob.innerHTML = g.length ? g.map(card).join("") : "<p class='meta'>Announcements coming soon.</p>";
}

load();