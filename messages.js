const convoList = document.getElementById("convoList");
const convoNote = document.getElementById("convoNote");
const searchBox = document.getElementById("searchBox");
const searchResults = document.getElementById("searchResults");

async function loadConversations() {
    const { data, error } = await db.rpc("my_conversations");

    if (error) {
        convoNote.textContent = "Could not load your messages. " + friendlyError(error);
        return;
    }

    if (data.length === 0) {
        convoList.innerHTML = "";
        convoNote.textContent = "No messages yet. Search for a member above and say hello.";
        return;
    }

    convoNote.textContent = "";
    convoList.innerHTML = "";

    data.forEach(function (c) {
        const row = document.createElement("a");
        row.className = "convo-row" + (Number(c.unread) > 0 ? " unread" : "");
        row.href = "chat.html?id=" + encodeURIComponent(c.id);

        row.innerHTML =
            avatarHTML(c.other_name, c.other_avatar, "avatar-md") +
            '<div class="convo-main"><div><span class="post-author">' + escapeHTML(c.other_name || "Member") + "</span>" +
            badgeHTML({ role: c.other_role, approved: c.other_approved, verified: c.other_verified, is_admin: c.other_is_admin }) +
            '</div><div class="convo-preview">' + escapeHTML(c.last_preview || "") + "</div></div>" +
            '<div class="convo-side"><span class="post-time">' + timeAgo(c.last_message_at) + "</span>" +
            (Number(c.unread) > 0 ? '<span class="unread-dot">' + (Number(c.unread) > 9 ? "9+" : Number(c.unread)) + "</span>" : "") +
            "</div>";

        convoList.appendChild(row);
    });
}

// ---------- Search for someone new to message ----------

let searchTimer = null;

searchBox.addEventListener("input", function () {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async function () {
        const text = searchBox.value.trim();

        if (text.length < 2) {
            searchResults.innerHTML = "";
            return;
        }

        const { data, error } = await db.rpc("find_members", { p_search: text });

        if (error) {
            searchResults.innerHTML = "<p class='meta'>" + escapeHTML(friendlyError(error)) + "</p>";
            return;
        }

        if (data.length === 0) {
            searchResults.innerHTML = "<p class='meta'>No members found.</p>";
            return;
        }

        searchResults.innerHTML = "";

        data.forEach(function (m) {
            const row = document.createElement("div");
            row.className = "member-row";

            row.innerHTML =
                '<a class="member-link" href="member.html?id=' + encodeURIComponent(m.id) + '">' +
                avatarHTML(m.full_name, m.avatar_path, "avatar-sm") +
                "<div><span class='post-author'>" + escapeHTML(m.full_name || "Member") + "</span>" + badgeHTML(m) +
                "<div class='post-time'>" + Number(m.follower_count) + " followers</div></div></a>" +
                '<button type="button" class="contact-btn message-member" data-id="' + escapeHTML(m.id) + '">Message</button>';

            searchResults.appendChild(row);
        });
    }, 300);
});

searchResults.addEventListener("click", async function (event) {
    const button = event.target.closest(".message-member");
    if (!button) return;

    button.disabled = true;

    const { data, error } = await db.rpc("start_conversation", { p_other: button.dataset.id });

    if (error) {
        button.disabled = false;
        alert(friendlyError(error));
        return;
    }

    window.location.href = "chat.html?id=" + encodeURIComponent(data);
});

// ---------- New messages appear by themselves ----------

let refreshTimer = null;

function refreshSoon() {
    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(function () {
        loadConversations();
        if (window.refreshDm) window.refreshDm();
    }, 400);
}

function listen() {
    try {
        db.channel("dm-inbox")
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "dm_messages" }, refreshSoon)
            .subscribe();
    } catch (error) {}

    // A backup in case the live connection drops
    setInterval(function () {
        if (!document.hidden) loadConversations();
    }, 15000);
}

async function init() {
    const member = await requireMarketplaceMember();
    if (!member) return;

    await loadConversations();
    listen();
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();