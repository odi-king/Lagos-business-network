// Shared by private messages and trade chats: quoted replies and Sent / Delivered / Seen marks.

function chatEscape(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function chatTime(value) {
    return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// sent = saved on the server, delivered = reached their phone, seen = they opened the chat
function chatStatus(row) {
    if (row.seen_at) return "seen";
    if (row.delivered_at) return "delivered";
    return "sent";
}

function chatStatusWord(row) {
    const s = chatStatus(row);
    return s === "seen" ? "Seen" : s === "delivered" ? "Delivered" : "Sent";
}

function ticksHTML(row) {
    const s = chatStatus(row);
    return '<span class="ticks ' + s + '" title="' + chatStatusWord(row) + '" aria-label="' + chatStatusWord(row) + '">' +
        (s === "sent" ? "\u2713" : "\u2713\u2713") + "</span>";
}

function chatSnippet(row) {
    if (row.kind === "post") return "Shared a post";
    if (row.kind === "offer") return "An offer";
    return String(row.body || "").slice(0, 80);
}

// The small box at the top of a bubble that shows which message it answers
function quoteHTML(original, nameOf) {
    if (!original) {
        return '<div class="reply-quote gone"><span>Original message</span></div>';
    }

    return '<div class="reply-quote" data-goto="' + chatEscape(original.id) + '"><strong>' +
        chatEscape(nameOf(original.sender_id)) + "</strong><span>" + chatEscape(chatSnippet(original)) + "</span></div>";
}

function jumpToMessage(box, id) {
    const target = box.querySelector('[data-id="' + id + '"]');
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("flash");
    setTimeout(function () { target.classList.remove("flash"); }, 1300);
}

function setReplyBar(name, snippet) {
    const bar = document.getElementById("replyBar");
    if (!bar) return;

    document.getElementById("replyName").textContent = name;
    document.getElementById("replySnippet").textContent = snippet;
    bar.style.display = "flex";
}

function hideReplyBar() {
    const bar = document.getElementById("replyBar");
    if (bar) bar.style.display = "none";
}