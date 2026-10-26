
 // Shared code for the marketplace feed, member profiles and reels.

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

// Turns technical errors into plain words
function friendlyError(error) {
    const text = error && error.message ? error.message : String(error || "");

    if (/failed to fetch|networkerror|network request failed|load failed/i.test(text)) {
        return "We could not reach the server. Please check your internet and try again.";
    }
    if (/jwt|not authenticated|invalid claim/i.test(text)) {
        return "Please log in again and try once more.";
    }
    if (/row-level security|permission denied/i.test(text)) {
        return "You are not allowed to do that.";
    }

    return text;
}

function randomName() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now() + "-" + Math.floor(Math.random() * 1000000);
}

// ---------- Profile pictures ----------

function avatarUrl(path) {
    if (!path) return null;
    return db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

function avatarHTML(name, path, extra) {
    const url = avatarUrl(path);
    const cls = "avatar " + (extra || "");

    if (url) {
        return '<img class="' + cls + '" src="' + escapeHTML(url) + '" alt="' + escapeHTML(name || "Member") + '" loading="lazy">';
    }

    const letter = (name || "M").trim().charAt(0).toUpperCase() || "M";
    return '<span class="' + cls + ' avatar-fallback">' + escapeHTML(letter) + "</span>";
}

// ---------- Photos: shrink before uploading ----------

function resizeToBlob(file, drawFn, width, height, quality) {
    return new Promise(function (resolve, reject) {
        if (!file.type.startsWith("image/")) {
            reject(new Error("Please choose a photo."));
            return;
        }

        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = function () {
            const canvas = document.createElement("canvas");
            drawFn(image, canvas, width, height);
            URL.revokeObjectURL(url);

            canvas.toBlob(function (blob) {
                if (!blob) {
                    reject(new Error("Could not read the photo."));
                } else if (blob.size > 3 * 1024 * 1024) {
                    reject(new Error("That photo is too large. Try a smaller one."));
                } else {
                    resolve(blob);
                }
            }, "image/jpeg", quality);
        };

        image.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read the photo."));
        };

        image.src = url;
    });
}

function compressImage(file) {
    return resizeToBlob(file, function (image, canvas) {
        const max = 1280;
        let width = image.width;
        let height = image.height;

        if (width > max || height > max) {
            const ratio = Math.min(max / width, max / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    }, 0, 0, 0.8);
}

// A square, centred crop for profile pictures
function compressSquare(file, size) {
    return resizeToBlob(file, function (image, canvas) {
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;

        canvas.width = size;
        canvas.height = size;
        canvas.getContext("2d").drawImage(image, sx, sy, side, side, 0, 0, size, size);
    }, 0, 0, 0.85);
}

// Checks a video chosen from the phone gallery
function checkVideoFile(file) {
    return new Promise(function (resolve, reject) {
        if (file.size > 50 * 1024 * 1024) {
            reject(new Error("That video is larger than 50 MB. Trim it, or paste a YouTube link instead."));
            return;
        }

        const video = document.createElement("video");
        const url = URL.createObjectURL(file);

        video.preload = "metadata";

        video.onloadedmetadata = function () {
            URL.revokeObjectURL(url);

            if (video.duration > 90) {
                reject(new Error("Videos can be up to 90 seconds long."));
            } else {
                resolve();
            }
        };

        video.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("This video format cannot be read here. Try an MP4 video."));
        };

        video.src = url;
    });
}

// ---------- Getting into marketplace pages ----------

async function requireMarketplaceMember() {
    const main = document.querySelector("main");

    if (!db) {
        main.innerHTML = "<p class='meta'>Supabase is not connected yet. Check supabase-config.js.</p>";
        return null;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        const here = window.location.pathname.split("/").pop() + window.location.search;
        window.location.href = "auth.html?next=" + encodeURIComponent(here);
        return null;
    }

    const user = data.session.user;

    if (!(await hasActiveMembership(user.id))) {
        window.location.href = "pay.html";
        return null;
    }

    const result = await db
        .from("profiles")
        .select("role, approved, graduated, is_admin")
        .eq("id", user.id)
        .single();

    const profile = result.data;
    const allowed = profile && (
        profile.is_admin ||
        (profile.role === "lecturer" && profile.approved) ||
        (profile.role === "student" && profile.graduated)
    );

    if (!allowed) {
        const waiting = profile && profile.role === "lecturer";

        main.innerHTML = `
            <div class="page-head"><h1>Marketplace</h1></div>
            <section class="panel">
                <h2>The marketplace is not open to you yet</h2>
                <p class="meta">${waiting
                    ? "Your lecturer account is still being verified. The marketplace opens as soon as it is approved."
                    : "Students unlock the marketplace when they graduate. You can graduate before one year by showing you have met the learning standards."}</p>
                <a href="classes.html" class="btn btn-primary" style="margin-top:10px;">Go to classes</a>
            </section>`;
        return null;
    }

    postsContext.meId = user.id;
    postsContext.isAdmin = !!profile.is_admin;

    return { user: user, profile: profile };
}

// ---------- Loading posts ----------

async function fetchPosts(mode, author, before, onlyVideo) {
    const { data, error } = await db.rpc("feed_posts", {
        p_mode: mode,
        p_author: author,
        p_limit: 10,
        p_before: before,
        p_only_video: !!onlyVideo
    });

    if (error) throw error;
    return data || [];
}

// Photos and videos are private, so each one needs a short-lived link.
// Improved: checks signing errors and avoids duplicate file paths.
async function signMedia(posts) {
    const media = { images: {}, videos: {} };

    async function sign(bucket, paths, target) {
        const uniquePaths = [...new Set(paths.filter(Boolean))];
        if (uniquePaths.length === 0) return;

        const { data, error } = await db.storage
            .from(bucket)
            .createSignedUrls(uniquePaths, 3600);

        if (error) {
            console.error("Could not sign media from " + bucket + ":", error);
            throw error;
        }

        (data || []).forEach(function (item) {
            if (item.signedUrl && item.path) {
                target[item.path] = item.signedUrl;
            } else if (item.error) {
                console.error("Could not sign file:", item.path, item.error);
            }
        });
    }

    await sign(
        "post-images",
        posts.map(function (p) { return p.image_path; }),
        media.images
    );

    await sign(
        "post-videos",
        posts.map(function (p) { return p.video_path; }),
        media.videos
    );

    return media;
}

function followButton(authorId, following) {
    if (authorId === postsContext.meId) return "";

    return '<button type="button" class="follow-btn' + (following ? " following" : "") +
        '" data-author="' + escapeHTML(authorId) + '">' + (following ? "Following" : "Follow") + "</button>";
}

function renderPostCard(p, media) {
    const own = p.author_id === postsContext.meId;
    const name = p.author_name || "Member";
    const card = document.createElement("article");

    card.className = "post-card";
    card.dataset.postId = p.id;
    card.dataset.authorId = p.author_id;
    card.dataset.imagePath = p.image_path || "";
    card.dataset.videoPath = p.video_path || "";
    card.dataset.caption = p.caption || "";
    card.dataset.price = p.price === null || p.price === undefined ? "" : String(p.price);
    card.dataset.edited = p.edited_at ? "yes" : "";
    card.dataset.created = p.created_at;

    let mediaHTML = "";

    if (p.image_path && media.images[p.image_path]) {
        mediaHTML += '<div class="post-media"><img class="post-image" src="' + escapeHTML(media.images[p.image_path]) +
            '" alt="Photo from ' + escapeHTML(name) + '" loading="lazy"></div>';
    }

    if (p.video_path && media.videos[p.video_path]) {
        mediaHTML += '<div class="post-media"><video class="post-video-el" src="' + escapeHTML(media.videos[p.video_path]) +
            '" controls playsinline preload="metadata"></video></div>';
    }

    const embed = p.video_url ? toEmbedUrl(p.video_url) : null;

    if (p.video_url) {
        mediaHTML += embed
            ? '<div class="post-media post-video"><button type="button" class="contact-btn post-watch" data-embed="' + escapeHTML(embed) + '">Watch video</button></div>'
            : '<div class="post-media post-video"><a class="contact-btn" target="_blank" rel="noopener" href="' + escapeHTML(p.video_url) + '">Open video</a></div>';
    }

    const message = p.business_id && !own
        ? '<button type="button" class="contact-btn post-message" data-business="' + escapeHTML(p.business_id) + '">Message seller</button>'
        : "";

    const remove = own || postsContext.isAdmin
        ? '<button type="button" class="plain-btn post-delete">Delete</button>'
        : "";

    const report = own ? "" : '<button type="button" class="plain-btn post-report">Report</button>';
    const edit = own ? '<button type="button" class="plain-btn post-edit">Edit</button>' : "";

    card.innerHTML = `
        <div class="post-head">
            <a class="post-person" href="member.html?id=${encodeURIComponent(p.author_id)}">
                ${avatarHTML(name, p.author_avatar, "avatar-sm")}
            </a>
            <div class="post-who">
                <a class="post-author" href="member.html?id=${encodeURIComponent(p.author_id)}">${escapeHTML(name)}</a>${badgeHTML(personFromPost(p))}
                <div class="post-time"></div>
            </div>
            ${followButton(p.author_id, p.following)}
        </div>
        ${mediaHTML}
        <div class="post-text"></div>
        <div class="post-actions">
            <button type="button" class="plain-btn post-like${p.liked ? " liked" : ""}">${p.liked ? "\u2665" : "\u2661"} <span class="like-count">${Number(p.like_count)}</span></button>
            <button type="button" class="plain-btn post-comments-toggle">Comments (<span class="comment-count">${Number(p.comment_count)}</span>)</button>
            <span><span class="view-count">${Number(p.view_count)}</span> views</span>
            ${message}
            ${edit}
            ${remove}
            ${report}
        </div>
    `;

    setPostText(card);
    return card;
}

// Shows the price and the words of a post (and the "edited" mark)
function setPostText(card) {
    const box = card.querySelector(".post-text");
    const caption = card.dataset.caption;
    const price = card.dataset.price;
    let html = "";

    if (price !== "") html += '<div class="post-price">' + formatPrice(price) + "</div>";
    if (caption) html += '<div class="post-caption">' + escapeHTML(caption) + "</div>";

    box.innerHTML = html;

    card.querySelector(".post-time").textContent =
        timeAgo(card.dataset.created) + (card.dataset.edited === "yes" ? " \u2022 edited" : "");
}

function startEditPost(card) {
    const box = card.querySelector(".post-text");
    if (box.querySelector(".post-edit-form")) return;

    box.innerHTML =
        '<div class="post-edit-form">' +
        '<label class="field-label">What you wrote</label>' +
        '<textarea class="edit-caption" maxlength="1000"></textarea>' +
        '<label class="field-label">Price in naira (leave empty if there is none)</label>' +
        '<input type="number" class="edit-price" min="0">' +
        '<p class="meta">To change a photo or video, delete this post and post again.</p>' +
        '<div class="edit-actions">' +
        '<button type="button" class="contact-btn edit-save">Save</button>' +
        '<button type="button" class="btn btn-outline edit-cancel">Cancel</button>' +
        "</div>" +
        '<p class="msg edit-note"></p></div>';

    box.querySelector(".edit-caption").value = card.dataset.caption;
    box.querySelector(".edit-price").value = card.dataset.price;
}

async function saveEditPost(card) {
    const box = card.querySelector(".post-text");
    const caption = box.querySelector(".edit-caption").value.trim();
    const priceValue = box.querySelector(".edit-price").value;
    const note = box.querySelector(".edit-note");
    const price = priceValue === "" ? null : parseInt(priceValue, 10);

    note.textContent = "";

    const { error } = await db.rpc("update_post", {
        p_post_id: card.dataset.postId,
        p_caption: caption,
        p_price: price
    });

    if (error) {
        note.className = "msg error edit-note";
        note.textContent = friendlyError(error);
        return;
    }

    card.dataset.caption = caption;
    card.dataset.price = price === null ? "" : String(price);
    card.dataset.edited = "yes";

    setPostText(card);
    showToast("Post updated");
}

// ---------- Counting views: once a post has been on screen for a moment ----------

let viewObserver = null;
const viewTimers = new Map();

async function countView(element) {
    const { data } = await db.rpc("record_view", { p_post_id: element.dataset.postId });

    if (data === true) {
        const counter = element.querySelector(".view-count");
        if (counter) counter.textContent = Number(counter.textContent) + 1;
    }
}

function observeView(card) {
    if (card.dataset.authorId === postsContext.meId) return;

    if (!viewObserver) {
        viewObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                const target = entry.target;

                if (entry.isIntersecting) {
                    if (viewTimers.has(target)) return;

                    viewTimers.set(target, setTimeout(function () {
                        viewObserver.unobserve(target);
                        viewTimers.delete(target);
                        countView(target);
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
    const media = await signMedia(posts);

    posts.forEach(function (p) {
        const card = renderPostCard(p, media);
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

        const mine = c.author_id === postsContext.meId;
        const canDelete = mine || postsContext.isAdmin;

        row.dataset.id = c.id;
        row.dataset.body = c.body;

        row.innerHTML =
            "<strong>" + escapeHTML(c.author_name || "Member") + "</strong>" +
            badgeHTML({ role: c.author_role, approved: c.author_approved, verified: c.author_verified, is_admin: c.author_is_admin }) +
            " " + escapeHTML(c.body) +
            (c.edited_at ? ' <span class="meta">(edited)</span>' : "") +
            (mine ? ' <button type="button" class="plain-btn comment-edit">Edit</button>' : "") +
            (canDelete ? ' <button type="button" class="plain-btn comment-delete" data-id="' + escapeHTML(c.id) + '">Delete</button>' : "");

        box.appendChild(row);
    });
}

function startEditComment(row) {
    row.classList.add("editing");
    row.innerHTML =
        '<input type="text" class="comment-edit-input" maxlength="500">' +
        '<button type="button" class="contact-btn comment-save">Save</button>' +
        '<button type="button" class="btn btn-outline comment-cancel">Cancel</button>';

    row.querySelector("input").value = row.dataset.body;
    row.querySelector("input").focus();
}

async function saveEditComment(card, row) {
    const text = row.querySelector("input").value.trim();
    const note = card.querySelector(".comment-note");

    note.textContent = "";

    const { error } = await db.rpc("update_comment", { p_comment_id: row.dataset.id, p_body: text });

    if (error) {
        note.className = "msg error comment-note";
        note.textContent = friendlyError(error);
        return;
    }

    await loadComments(card);
    showToast("Comment updated");
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
        note.textContent = friendlyError(error);
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

        if (target.closest(".post-edit")) {
            startEditPost(card);
            return;
        }

        if (target.closest(".edit-save")) {
            await saveEditPost(card);
            return;
        }

        if (target.closest(".edit-cancel")) {
            setPostText(card);
            return;
        }

        if (target.closest(".comment-edit")) {
            startEditComment(target.closest(".comment"));
            return;
        }

        if (target.closest(".comment-save")) {
            await saveEditComment(card, target.closest(".comment"));
            return;
        }

        if (target.closest(".comment-cancel")) {
            await loadComments(card);
            return;
        }

        const likeBtn = target.closest(".post-like");
        if (likeBtn) {
            const { data, error } = await db.rpc("toggle_like", { p_post_id: card.dataset.postId });
            if (error) { alert(friendlyError(error)); return; }

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
            if (error) { alert(friendlyError(error)); return; }
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

        const messageBtn = target.closest(".post-message");
        if (messageBtn) {
            messageBtn.disabled = true;

            const { data, error } = await db.rpc("start_trade", { p_business_id: messageBtn.dataset.business });

            messageBtn.disabled = false;
            if (error) { alert(friendlyError(error)); return; }

            window.location.href = "trade.html?id=" + encodeURIComponent(data);
            return;
        }

        if (target.closest(".post-delete")) {
            if (!confirm("Delete this post?")) return;

            const { error } = await db.rpc("delete_post", { p_post_id: card.dataset.postId });
            if (error) { alert(friendlyError(error)); return; }

            if (card.dataset.imagePath) await db.storage.from("post-images").remove([card.dataset.imagePath]);
            if (card.dataset.videoPath) await db.storage.from("post-videos").remove([card.dataset.videoPath]);

            card.remove();
            return;
        }

        if (target.closest(".post-report")) {
            const reason = prompt("Tell us what is wrong with this post. The LBN team will look at it.");
            if (!reason) return;

            const { error } = await db.rpc("report_post", { p_post_id: card.dataset.postId, p_reason: reason });
            alert(error ? friendlyError(error) : "Thank you. Your report was sent to the LBN team.");
        }
    });

    listEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && event.target.classList.contains("comment-input")) {
            event.preventDefault();
            sendComment(event.target.closest(".post-card"));
        }

        if (event.key === "Enter" && event.target.classList.contains("comment-edit-input")) {
            event.preventDefault();
            saveEditComment(event.target.closest(".post-card"), event.target.closest(".comment"));
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
        alert(friendlyError(error));
        return;
    }

    document.querySelectorAll('.follow-btn[data-author="' + author + '"]').forEach(function (b) {
        b.textContent = data ? "Following" : "Follow";
        b.classList.toggle("following", data);
    });

    document.dispatchEvent(new CustomEvent("follow-changed", { detail: { author: author, following: data } }));
});

// A small message that fades away
function showToast(text) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    document.body.appendChild(toast);

    setTimeout(function () { toast.classList.add("show"); }, 10);
    setTimeout(function () {
        toast.classList.remove("show");
        setTimeout(function () { toast.remove(); }, 300);
    }, 2400);
}
