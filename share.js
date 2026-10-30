// The Share sheet for posts and videos:
// WhatsApp, Instagram, Facebook, X, a private message, the phone's own share menu, or copy the link.

function postLink(id) {
    return new URL("post.html?id=" + encodeURIComponent(id), window.location.href).href;
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        prompt("Copy this link:", text);
        return false;
    }
}

function closeShare() {
    const sheet = document.getElementById("shareSheet");
    if (sheet) sheet.remove();
}

function shareOption(id, label, symbol, color) {
    return '<button type="button" class="share-opt" data-share="' + id + '">' +
        '<span class="share-icon" style="background:' + color + ';">' + symbol + "</span><span>" + label + "</span></button>";
}

function openShare(postId, caption, authorName) {
    closeShare();

    const url = postLink(postId);
    const title = (authorName ? authorName + " on " : "") + "Lagos Business Network";
    const text = title + (caption ? ": " + String(caption).slice(0, 90) : "");

    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.id = "shareSheet";
    sheet.style.display = "flex";

    sheet.innerHTML =
        '<div class="sheet-card">' +
        '<div class="sheet-head"><strong>Share</strong><button type="button" class="plain-btn" data-share="close">Close</button></div>' +
        '<div class="share-grid">' +
        (navigator.share ? shareOption("more", "More apps", "\u2197", "#3b82f6") : "") +
        shareOption("whatsapp", "WhatsApp", "W", "#25d366") +
        shareOption("instagram", "Instagram", "IG", "#e1306c") +
        shareOption("facebook", "Facebook", "f", "#1877f2") +
        shareOption("x", "X", "X", "#000000") +
        shareOption("message", "Send in a message", "\u2709", "#22d3a0") +
        shareOption("copy", "Copy link", "\u29C9", "#64748b") +
        "</div>" +
        '<div id="sharePeople" style="display:none;"></div>' +
        "</div>";

    document.body.appendChild(sheet);

    sheet.addEventListener("click", async function (event) {
        if (event.target === sheet) {
            closeShare();
            return;
        }

        const option = event.target.closest("[data-share]");
        if (!option) return;

        const choice = option.dataset.share;

        if (choice === "close") {
            closeShare();
        } else if (choice === "more") {
            try {
                await navigator.share({ title: title, text: text, url: url });
            } catch (error) {}
        } else if (choice === "whatsapp") {
            window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + url), "_blank", "noopener");
        } else if (choice === "facebook") {
            window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url), "_blank", "noopener");
        } else if (choice === "x") {
            window.open("https://x.com/intent/post?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(url), "_blank", "noopener");
        } else if (choice === "instagram") {
            // Instagram has no web share link, so we copy it for you to paste
            const copied = await copyText(url);
            if (copied) showToast("Link copied. Open Instagram and paste it in a story, post or message.");
        } else if (choice === "copy") {
            const copied = await copyText(url);
            if (copied) showToast("Link copied");
        } else if (choice === "message") {
            showSharePeople(postId);
        } else if (choice === "send") {
            sendShared(option, postId);
        }
    });
}

// ---------- Send to a member in a private message ----------

function personRow(m, name, avatar) {
    return '<div class="member-row"><div class="member-link">' + avatarHTML(name, avatar, "avatar-sm") +
        "<div><span class='post-author'>" + escapeHTML(name || "Member") + "</span>" + badgeHTML(m) + "</div></div>" +
        '<button type="button" class="contact-btn" data-share="send" data-member="' + escapeHTML(m.id || m.other_id) + '">Send</button></div>';
}

async function showSharePeople(postId) {
    const box = document.getElementById("sharePeople");
    box.style.display = "block";
    box.innerHTML = '<input type="text" id="shareSearch" class="search-box" placeholder="Search members by name"><div id="shareResults"><p class="meta">Loading...</p></div>';

    const results = document.getElementById("shareResults");

    async function showRecent() {
        const { data } = await db.rpc("my_conversations");
        const list = (data || []).slice(0, 8);

        results.innerHTML = list.length === 0
            ? "<p class='meta'>Type a name above to find someone.</p>"
            : "<p class='meta'>Recent chats</p>" + list.map(function (c) {
                return personRow({
                    id: c.other_id, role: c.other_role, approved: c.other_approved,
                    verified: c.other_verified, is_admin: c.other_is_admin
                }, c.other_name, c.other_avatar);
            }).join("");
    }

    await showRecent();

    let timer = null;

    document.getElementById("shareSearch").addEventListener("input", function (event) {
        clearTimeout(timer);

        timer = setTimeout(async function () {
            const text = event.target.value.trim();

            if (text.length < 2) {
                await showRecent();
                return;
            }

            const { data, error } = await db.rpc("find_members", { p_search: text });

            if (error) {
                results.innerHTML = "<p class='meta'>" + escapeHTML(friendlyError(error)) + "</p>";
                return;
            }

            results.innerHTML = data.length === 0
                ? "<p class='meta'>No members found.</p>"
                : data.map(function (m) { return personRow(m, m.full_name, m.avatar_path); }).join("");
        }, 300);
    });
}

async function sendShared(button, postId) {
    button.disabled = true;

    const { error } = await db.rpc("share_post_to_member", {
        p_other: button.dataset.member,
        p_post_id: postId,
        p_note: ""
    });

    if (error) {
        button.disabled = false;
        alert(friendlyError(error));
        return;
    }

    button.textContent = "Sent \u2713";
    showToast("Sent in a private message");
}