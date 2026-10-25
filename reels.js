let lastCreated = null;
let loadingMore = false;
let finished = false;

const reelsEl = document.getElementById("reels");
const reelsNote = document.getElementById("reelsNote");

let playObserver = null;
let moreObserver = null;
const reelTimers = new Map();

async function init() {
    const member = await requireMarketplaceMember();
    if (!member) return;

    await loadMore();
}

async function loadMore() {
    if (loadingMore || finished) return;
    loadingMore = true;

    let posts;

    try {
        posts = await fetchPosts("all", null, lastCreated, true);
    } catch (error) {
        reelsNote.textContent = "Could not load videos. " + error.message;
        loadingMore = false;
        return;
    }

    if (posts.length === 0) {
        finished = true;

        if (!lastCreated) {
            reelsEl.innerHTML = "";
            reelsNote.textContent = "No videos yet. Post a video from your phone on the Marketplace page.";
        }

        loadingMore = false;
        return;
    }

    const media = await signMedia(posts);

    posts.forEach(function (p, index) {
        if (!media.videos[p.video_path]) return;

        const reel = renderReel(p, media.videos[p.video_path]);
        reelsEl.appendChild(reel);
        watchReel(reel);

        // When the second-to-last video comes into view, load more
        if (index === posts.length - 2 || posts.length === 1) {
            watchForMore(reel);
        }
    });

    lastCreated = posts[posts.length - 1].created_at;
    if (posts.length < 10) finished = true;

    loadingMore = false;
}

function renderReel(p, src) {
    const own = p.author_id === postsContext.meId;
    const name = p.author_name || "Member";
    const section = document.createElement("section");

    section.className = "reel";
    section.dataset.postId = p.id;
    section.dataset.authorId = p.author_id;

    const price = p.price !== null && p.price !== undefined
        ? '<div class="post-price">' + formatPrice(p.price) + "</div>"
        : "";

    const message = p.business_id && !own
        ? '<button type="button" class="contact-btn reel-message" data-business="' + escapeHTML(p.business_id) + '">Message seller</button>'
        : "";

    section.innerHTML = `
        <video class="reel-video" src="${escapeHTML(src)}" loop muted playsinline preload="metadata"></video>
        <div class="reel-shade"></div>
        <div class="reel-info">
            <div class="reel-author">
                <a class="post-person" href="member.html?id=${encodeURIComponent(p.author_id)}">${avatarHTML(name, p.author_avatar, "avatar-sm")}</a>
                <a class="post-author" href="member.html?id=${encodeURIComponent(p.author_id)}">${escapeHTML(name)}</a>${badgeHTML(personFromPost(p))}
                ${followButton(p.author_id, p.following)}
            </div>
            ${price}
            ${p.caption ? '<div class="reel-caption">' + escapeHTML(p.caption) + "</div>" : ""}
            ${message}
        </div>
        <div class="reel-actions">
            <button type="button" class="reel-btn reel-like${p.liked ? " liked" : ""}"><span class="reel-icon">${p.liked ? "\u2665" : "\u2661"}</span><span class="like-count">${Number(p.like_count)}</span></button>
            <div class="reel-stat"><span class="reel-icon">\u25B6</span><span class="view-count">${Number(p.view_count)}</span></div>
            <button type="button" class="reel-btn reel-sound"><span class="reel-icon">\uD83D\uDD07</span><span>Sound</span></button>
        </div>
    `;

    return section;
}

// Plays the video that is on screen and pauses the others
function watchReel(reel) {
    if (!playObserver) {
        playObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                const reel = entry.target;
                const video = reel.querySelector(".reel-video");

                if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
                    const attempt = video.play();
                    if (attempt && attempt.catch) attempt.catch(function () {});

                    if (reel.dataset.authorId !== postsContext.meId && !reelTimers.has(reel)) {
                        reelTimers.set(reel, setTimeout(function () {
                            countView(reel);
                        }, 1500));
                    }
                } else {
                    video.pause();

                    if (reelTimers.has(reel) && reel.dataset.counted !== "yes") {
                        clearTimeout(reelTimers.get(reel));
                        reelTimers.delete(reel);
                    }
                }
            });
        }, { root: reelsEl, threshold: [0, 0.7] });
    }

    playObserver.observe(reel);
}

function watchForMore(reel) {
    if (!moreObserver) {
        moreObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    moreObserver.unobserve(entry.target);
                    loadMore();
                }
            });
        }, { root: reelsEl, threshold: 0.5 });
    }

    moreObserver.observe(reel);
}

reelsEl.addEventListener("click", async function (event) {
    const target = event.target;
    const reel = target.closest(".reel");
    if (!reel) return;

    const video = reel.querySelector(".reel-video");

    const like = target.closest(".reel-like");
    if (like) {
        const { data, error } = await db.rpc("toggle_like", { p_post_id: reel.dataset.postId });
        if (error) { alert(error.message); return; }

        const counter = like.querySelector(".like-count");
        counter.textContent = Number(counter.textContent) + (data ? 1 : -1);
        like.classList.toggle("liked", data);
        like.querySelector(".reel-icon").textContent = data ? "\u2665" : "\u2661";
        return;
    }

    if (target.closest(".reel-sound")) {
        video.muted = !video.muted;
        target.closest(".reel-sound").querySelector(".reel-icon").textContent = video.muted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
        return;
    }

    const message = target.closest(".reel-message");
    if (message) {
        message.disabled = true;

        const { data, error } = await db.rpc("start_trade", { p_business_id: message.dataset.business });

        message.disabled = false;
        if (error) { alert(error.message); return; }

        window.location.href = "trade.html?id=" + encodeURIComponent(data);
        return;
    }

    // Tap the video to pause or play
    if (target.closest(".reel-video") || target.closest(".reel-shade")) {
        if (video.paused) {
            video.play().catch(function () {});
        } else {
            video.pause();
        }
    }
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();