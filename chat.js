const conversationId = new URLSearchParams(window.location.search).get("id");

let me = null;
let conversation = null;
let lastSignature = "";

const dmBox = document.getElementById("dmBox");
const dmNote = document.getElementById("dmNote");
const dmForm = document.getElementById("dmForm");
const dmInput = document.getElementById("dmInput");

function showNote(text, type) {
    dmNote.textContent = text;
    dmNote.className = "msg " + (type || "error");
}

function timeLabel(value) {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function init() {
    const member = await requireMarketplaceMember();
    if (!member) return;

    me = member.user;

    if (!conversationId) {
        window.location.href = "messages.html";
        return;
    }

    const info = await db.rpc("get_conversation", { p_id: conversationId });

    if (info.error || !info.data || !info.data[0]) {
        document.getElementById("dmPerson").textContent = "Conversation not found";
        dmForm.style.display = "none";
        return;
    }

    conversation = info.data[0];
    renderHeader();
    await refresh(true);
    listen();
}

function renderHeader() {
    const c = conversation;

    const person = document.getElementById("dmPerson");
    person.href = "member.html?id=" + encodeURIComponent(c.other_id);
    person.innerHTML =
        avatarHTML(c.other_name, c.other_avatar, "avatar-sm") +
        "<span><strong>" + escapeHTML(c.other_name || "Member") + "</strong>" +
        badgeHTML({ role: c.other_role, approved: c.other_approved, verified: c.other_verified, is_admin: c.other_is_admin }) + "</span>";

    document.getElementById("optProfile").href = "member.html?id=" + encodeURIComponent(c.other_id);
    document.querySelector("#optBlock span").textContent = c.blocked_by_me ? "Unblock" : "Block";

    const blocked = c.blocked_by_me || c.blocked_me;
    dmForm.style.display = blocked ? "none" : "flex";

    const banner = document.getElementById("dmBlocked");
    banner.style.display = blocked ? "block" : "none";
    banner.textContent = c.blocked_by_me
        ? "You blocked this member. Unblock them to send messages."
        : "You cannot send messages to this member.";
}

async function refresh(first) {
    const { data, error } = await db.rpc("dm_list", { p_conversation_id: conversationId, p_limit: 80 });

    if (error) {
        showNote("Could not load messages. " + friendlyError(error));
        return;
    }

    const rows = data.slice().reverse();
    const signature = rows.map(function (r) { return r.id; }).join("|");

    if (signature !== lastSignature) {
        const nearBottom = dmBox.scrollHeight - dmBox.scrollTop - dmBox.clientHeight < 120;
        lastSignature = signature;
        renderMessages(rows);

        if (first || nearBottom) dmBox.scrollTop = dmBox.scrollHeight;
    }

    // Opening the chat marks what you can see as read
    db.rpc("mark_conversation_read", { p_cid: conversationId }).then(function () {
        if (window.refreshDm) window.refreshDm();
    });
}

function renderMessages(rows) {
    dmBox.innerHTML = "";

    if (rows.length === 0) {
        dmBox.innerHTML = "<div class='chat-system'>Say hello</div>";
        return;
    }

    rows.forEach(function (r) {
        const mine = r.sender_id === me.id;
        const item = document.createElement("div");

        if (r.kind === "post") {
            item.className = "chat-msg dm-post " + (mine ? "mine" : "theirs");

            item.innerHTML = r.post_id
                ? '<a class="share-card" href="post.html?id=' + encodeURIComponent(r.post_id) + '">' +
                  "<strong>" + (r.post_is_video ? "Shared a video" : "Shared a post") + "</strong>" +
                  "<span>By " + escapeHTML(r.post_author || "a member") + "</span>" +
                  (r.post_caption ? "<span>" + escapeHTML(r.post_caption) + "</span>" : "") +
                  (r.post_price !== null ? "<span class='post-price' style='margin:6px 0 0;font-size:16px;'>" + formatPrice(r.post_price) + "</span>" : "") +
                  "<span class='meta'>Tap to open</span></a>" +
                  '<div class="dm-time">' + timeLabel(r.created_at) + "</div>"
                : "<em>This post is no longer available.</em>" + '<div class="dm-time">' + timeLabel(r.created_at) + "</div>";
        } else {
            item.className = "chat-msg " + (mine ? "mine" : "theirs");
            item.innerHTML = escapeHTML(r.body) + '<div class="dm-time">' + timeLabel(r.created_at) + "</div>";
        }

        dmBox.appendChild(item);
    });
}

dmForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const text = dmInput.value.trim();
    if (!text) return;

    const button = document.getElementById("dmSend");
    button.disabled = true;
    showNote("");

    const { error } = await db.rpc("send_dm", { p_conversation_id: conversationId, p_body: text });

    button.disabled = false;

    if (error) {
        showNote(friendlyError(error));
        return;
    }

    dmInput.value = "";
    await refresh(true);
});

// ---------- Real time ----------

function listen() {
    try {
        db.channel("dm-" + conversationId)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "dm_messages",
                filter: "conversation_id=eq." + conversationId
            }, function () { refresh(false); })
            .subscribe();
    } catch (error) {}

    // A backup in case the live connection drops
    setInterval(function () {
        if (!document.hidden) refresh(false);
    }, 8000);

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) refresh(false);
    });
}

// ---------- Options: profile, block, report ----------

const sheet = document.getElementById("dmSheet");

document.getElementById("dmMenu").addEventListener("click", function () {
    sheet.style.display = "flex";
});

document.getElementById("dmSheetClose").addEventListener("click", function () {
    sheet.style.display = "none";
});

sheet.addEventListener("click", function (event) {
    if (event.target === sheet) sheet.style.display = "none";
});

document.getElementById("optBlock").addEventListener("click", async function () {
    const blocking = !conversation.blocked_by_me;

    if (blocking && !confirm("Block this member? Neither of you will be able to send messages.")) return;

    const { error } = await db.rpc(blocking ? "block_user" : "unblock_user", { p_user: conversation.other_id });

    if (error) {
        alert(friendlyError(error));
        return;
    }

    conversation.blocked_by_me = blocking;
    renderHeader();
    sheet.style.display = "none";
    showToast(blocking ? "Member blocked" : "Member unblocked");
});

document.getElementById("optReport").addEventListener("click", async function () {
    sheet.style.display = "none";

    const reason = prompt("Tell us what is wrong. The LBN team will look at it.");
    if (!reason) return;

    const { error } = await db.rpc("report_conversation", { p_cid: conversationId, p_reason: reason });
    alert(error ? friendlyError(error) : "Thank you. Your report was sent to the LBN team.");
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();