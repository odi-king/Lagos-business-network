// Shared code for showing posts on the Marketplace home and on member pages.

const postsContext = { meId: null, isAdmin: false };

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function personFromPost(p) {
    return {
        role: p.author_role,
        approved: p.author_approved,
        verified: p.author_verified,
        is_admin: p.author_is_admin
    };
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

function formatPrice(price) {
    return Number(price) === 0 ? "Free" : "\u20A6" + Number(price).toLocaleString();
}

async function fetchPosts(mode, author, before) {
    const { data, error } = await db.rpc("feed_posts", {
        p_mode: mode,
        p_author: author,
        p_limit: 10,
        p_before: before
    });

    if (error) throw error;
    return data;
}

// Photos are private, so each one needs a short-lived link
async function signImages(posts) {
    const paths = posts.filter(function (p) { return p.image_path; }).map(function (p) { return p.image_path; });
    const urls = {};

    if (paths.length === 0) return urls;

    const { data } = await db.storage.from("post-images").createSignedUrls(paths, 3600);

    (data || []).forEach(function (item) {
        if (item.signedUrl) urls[item.path] = item.signedUrl;
    });

    return urls;
}

function followButton(authorId, following) {
    if (authorId === postsContext.meId) return "";
    return '<button type="button" class="follow-btn' + (following ? " following" : "") +
        '" data-author="' + escapeHTML(authorId) + '">' + (following ? "Following" : "Follow") + "</button>";
}

function renderPostCard(p, imageUrls) {
    const own = p.author_id === postsContext.meId;
    const name = p.author_name || "Member";
    const card = document.createElement("article");

    card.className = "post-card";
    card.dataset.postId = p.id;
    card.dataset.authorId = p.author_id;

    let media = "";
    const embed = p.video_url ? toEmbedUrl(p.video_url) : null;

    if (p.image_path && imageUrls[p.image_path]) {
        media += '<div class="post-media"><img class="post-image" src="' + escapeHTML(imageUrls[p.image_path]) +
            '" alt="Photo from ' + escapeHTML(name) + '" loading="lazy"></div>';
    }

    if (p.video_url) {
        media += embed
            ? '<div class="post-media post-video"><button type="button" class="contact-btn post-watch" data-embed="' + escapeHTML(embed) + '">Watch video</button></div>'
            : '<div class="post-media post-video"><a class="contact-btn" target="_blank" rel="noopener" href="' + escapeHTML(p.video_url) + '">Open video</a></div>';
    }

    const price = p.price !== null && p.price !== undefined
        ? '<div class="post-price">' + formatPrice(p.price) + "</div>"
        : "";

    const caption = p.caption ? '<div class="post-caption">' + escapeHTML(p.caption) + "</div>" : "";

    const message = p.business_id && !own
        ? '<button type="button" class="contact-btn post-message" data-business="' + escapeHTML(p.business_id) + '">Message seller</button>'
        : "";

    const remove = own || postsContext.isAdmin
        ? '<button type="button" class="plain-btn post-delete">Delete</button>'
        : "";

    const report = own
        ? ""
        : '<button type="button" class="plain-btn post-report">Report</button>';

    card.innerHTML = `
        <div class="post-head">
            <div>
                <a class="post-author" href="member.html?id=${encodeURIComponent(p.author_id)}">${escapeHTML(name)}</a>${badgeHTML(personFromPost(p))}
                <div class="post-time">${timeAgo(p.created_at)}</div>
            </div>
            ${followButton(p.author_id, p.following)}
        </div>
        ${media}
        ${price}
        ${caption}
        <div class="post-actions">
            <button type="button" class="plain-btn post-like${p.liked ? " liked" : ""}">${p.liked ? "\u2665" : "\u2661"} <span class="like-count">${Number(p.like_count)}</span></button>
            <button type="button" class="plain-btn post-comments-toggle">Comments (<span class="comment-count">${Number(p.comment_count)}</span>)</button>
            <span><span class="view-count">${Number(p.view_count)}</span> views</span>
            ${message}
            ${remove}
            ${report}
        </div>
    `;

    return card;
}

// ---------- Counting views: once a post has been on screen for a moment ----------

let viewObserver = null;
const viewTimers = new Map();

function observeView(card) {
    if (card.dataset.authorId === postsContext.meId) return;

    if (!viewObserver) {
        viewObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                const target = entry.target;

                if (entry.isIntersecting) {
                    if (viewTimers.has(target)) return;

                    viewTimers.set(target, setTimeout(async function () {
                        viewObserver.unobserve(target);
                        viewTimers.delete(target);

                        const { data } = await db.rpc("record_view", { p_post_id: target.dataset.postId });

                        if (data === true) {
                            const counter = target.querySelector(".view-count");
                            if (counter) counter.textContent = Number(counter.textContent) + 1;
                        }
                    }, 1500));
                } else if (viewTimers.has(target)) {
                    clearTimeout(viewTimers.get(target));
                    viewTimers.delete(target);
                }
            });
        }, { threshold: 0.6 });
    }

    viewObserver.observe(card);
}

async function appendPosts(listEl, posts) {
    const imageUrls = await signImages(posts);

    posts.forEach(function (p) {
        const card = renderPostCard(p, imageUrls);
        listEl.appendChild(card);
        observeView(card);
    });
}

// ---------- Comments ----------

async function loadComments(card) {
    const box = card.querySelector(".comment-list");
    const { data, error } = await db.rpc("list_post_comments", { p_post_id: card.dataset.postId });

    if (error) {
        box.innerHTML = "<p class='meta'>Could not load comments.</p>";
        return;
    }

    card.querySelector(".comment-count").textContent = data.length;

    if (data.length === 0) {
        box.innerHTML = "<p class='meta'>No comments yet. Be the first.</p>";
        return;
    }

    box.innerHTML = "";

    data.forEach(function (c) {
        const row = document.createElement("div");
        row.className = "comment";

        const canDelete = c.author_id === postsContext.meId || postsContext.isAdmin;

        row.innerHTML =
            "<strong>" + escapeHTML(c.author_name || "Member") + "</strong>" +
            badgeHTML({ role: c.author_role, approved: c.author_approved, verified: c.author_verified, is_admin: c.author_is_admin }) +
            " " + escapeHTML(c.body) +
            (canDelete ? ' <button type="button" class="plain-btn comment-delete" data-id="' + escapeHTML(c.id) + '">Delete</button>' : "");

        box.appendChild(row);
    });
}

async function toggleComments(card) {
    const existing = card.querySelector(".post-comments");

    if (existing) {
        existing.remove();
        return;
    }

    const box = document.createElement("div");
    box.className = "post-comments";
    box.innerHTML =
        '<div class="comment-list"><p class="meta">Loading...</p></div>' +
        '<div class="comment-form"><input type="text" class="comment-input" placeholder="Write a comment" maxlength="500">' +
        '<button type="button" class="contact-btn comment-send">Post</button></div>' +
        '<p class="msg comment-note"></p>';

    card.appendChild(box);
    await loadComments(card);
}

async function sendComment(card) {
    const input = card.querySelector(".comment-input");
    const note = card.querySelector(".comment-note");
    const text = input.value.trim();

    if (!text) return;

    note.textContent = "";

    const { error } = await db.rpc("add_comment", { p_post_id: card.dataset.postId, p_body: text });

    if (error) {
        note.className = "msg error comment-note";
        note.textContent = error.message;
        return;
    }

    input.value = "";
    await loadComments(card);
}

// ---------- Clicks on a list of posts ----------

function mountPosts(listEl) {
    listEl.addEventListener("click", async function (event) {
        const target = event.target;
        const card = target.closest(".post-card");
        if (!card) return;

        const likeBtn = target.closest(".post-like");
        if (likeBtn) {
            const { data, error } = await db.rpc("toggle_like", { p_post_id: card.dataset.postId });
            if (error) { alert(error.message); return; }

            const counter = likeBtn.querySelector(".like-count");
            counter.textContent = Number(counter.textContent) + (data ? 1 : -1);
            likeBtn.classList.toggle("liked", data);
            likeBtn.firstChild.textContent = data ? "\u2665 " : "\u2661 ";
            return;
        }

        if (target.closest(".post-comments-toggle")) {
            await toggleComments(card);
            return;
        }

        if (target.closest(".comment-send")) {
            await sendComment(card);
            return;
        }

        const commentDelete = target.closest(".comment-delete");
        if (commentDelete) {
            if (!confirm("Delete this comment?")) return;
            const { error } = await db.rpc("delete_comment", { p_comment_id: commentDelete.dataset.id });
            if (error) { alert(error.message); return; }
            await loadComments(card);
            return;
        }

        const watch = target.closest(".post-watch");
        if (watch) {
            const wrap = document.createElement("div");
            wrap.className = "video-wrap";

            const frame = document.createElement("iframe");
            frame.src = watch.dataset.embed;
            frame.loading = "lazy";
            frame.allowFullscreen = true;
            frame.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");

            wrap.appendChild(frame);
            watch.parentElement.innerHTML = "";
            card.querySelector(".post-video").appendChild(wrap);
            return;
        }

        if (target.closest(".post-message")) {
            const button = target.closest(".post-message");
            button.disabled = true;

            const { data, error } = await db.rpc("start_trade", { p_business_id: button.dataset.business });

            button.disabled = false;
            if (error) { alert(error.message); return; }

            window.location.href = "trade.html?id=" + encodeURIComponent(data);
            return;
        }

        if (target.closest(".post-delete")) {
            if (!confirm("Delete this post?")) return;

            const { error } = await db.rpc("delete_post", { p_post_id: card.dataset.postId });
            if (error) { alert(error.message); return; }

            card.remove();
            return;
        }

        if (target.closest(".post-report")) {
            const reason = prompt("Tell us what is wrong with this post. The LBN team will look at it.");
            if (!reason) return;

            const { error } = await db.rpc("report_post", { p_post_id: card.dataset.postId, p_reason: reason });
            alert(error ? error.message : "Thank you. Your report was sent to the LBN team.");
        }
    });

    listEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && event.target.classList.contains("comment-input")) {
            event.preventDefault();
            sendComment(event.target.closest(".post-card"));
        }
    });
}

// ---------- Follow buttons work everywhere on the page ----------

document.addEventListener("click", async function (event) {
    const button = event.target.closest(".follow-btn");
    if (!button) return;

    const author = button.dataset.author;
    button.disabled = true;

    const { data, error } = await db.rpc("toggle_follow", { p_target: author });

    button.disabled = false;

    if (error) {
        alert(error.message);
        return;
    }

    document.querySelectorAll('.follow-btn[data-author="' + author + '"]').forEach(function (b) {
        b.textContent = data ? "Following" : "Follow";
        b.classList.toggle("following", data);
    });

    document.dispatchEvent(new CustomEvent("follow-changed", { detail: { author: author, following: data } }));
});