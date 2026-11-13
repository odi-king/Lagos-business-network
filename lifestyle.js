let me = null;
let feedMode = "all";
let searchText = "";
let lastCreated = null;
let taggedPeople = [];
let mediaFile = null;
let previewUrl = null;

const feedList = document.getElementById("feedList");
const feedNote = document.getElementById("feedNote");
const loadMoreBtn = document.getElementById("loadMore");
const postForm = document.getElementById("postForm");
const postNote = document.getElementById("postNote");

function showPostNote(text, type) {
    postNote.textContent = text;
    postNote.className = "msg " + (type || "");
}

async function init() {
    // Lifestyle is for every member with an active membership, graduated or not
    const member = await requireSocialMember();
    if (!member) return;

    me = member.user;

    mountPosts(feedList);
    await loadFeed(true);
}

async function fetchPage(before) {
    const { data, error } = await db.rpc("market_posts", {
        p_search: searchText,
        p_filter: "lifestyle",
        p_mode: feedMode,
        p_limit: 10,
        p_before: before
    });

    if (error) throw error;
    return data;
}

async function loadFeed(reset) {
    if (reset) {
        feedList.innerHTML = "";
        lastCreated = null;
        feedNote.textContent = "";
    }

    let posts;

    try {
        posts = await fetchPage(lastCreated);
    } catch (error) {
        feedNote.textContent = /could not find the function|schema cache/i.test(error.message)
            ? "Lifestyle needs its database update. Run supabase-access.sql and supabase-sections.sql in Supabase."
            : "Could not load posts. " + friendlyError(error);
        return;
    }

    if (posts.length === 0 && reset) {
        feedNote.textContent = searchText
            ? 'Nothing found for "' + searchText + '".'
            : feedMode === "following"
                ? "Nothing here yet. Follow members to see their posts."
                : "No posts yet. Be the first to share something.";
    }

    await appendPosts(feedList, posts);

    if (posts.length > 0) lastCreated = posts[posts.length - 1].created_at;
    loadMoreBtn.style.display = posts.length === 10 ? "" : "none";
}

loadMoreBtn.addEventListener("click", function () { loadFeed(false); });

document.querySelectorAll(".tabs .tab-btn").forEach(function (button) {
    button.addEventListener("click", function () {
        document.querySelectorAll(".tabs .tab-btn").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        feedMode = button.dataset.mode;
        loadFeed(true);
    });
});

let searchTimerLife = null;

document.getElementById("searchBox").addEventListener("input", function (event) {
    clearTimeout(searchTimerLife);

    searchTimerLife = setTimeout(function () {
        searchText = event.target.value.trim();
        loadFeed(true);
    }, 350);
});

// ---------- Picking a photo or video from the phone gallery ----------

function clearMedia() {
    mediaFile = null;

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }

    document.getElementById("postMedia").value = "";

    const preview = document.getElementById("mediaPreview");
    preview.style.display = "none";
    preview.innerHTML = "";

    document.getElementById("pickMedia").style.display = "";
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
}

document.getElementById("pickMedia").addEventListener("click", function () {
    document.getElementById("postMedia").click();
});

document.getElementById("postMedia").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");

    if (!isVideo && !file.type.startsWith("image/")) {
        showPostNote("Please choose a photo or a video.", "error");
        return;
    }

    showPostNote("");
    mediaFile = file;
    previewUrl = URL.createObjectURL(file);

    const preview = document.getElementById("mediaPreview");

    preview.innerHTML =
        (isVideo
            ? '<video src="' + previewUrl + '#t=0.1" muted playsinline preload="metadata"></video><span class="media-duration" id="mediaDuration"></span>'
            : '<img src="' + previewUrl + '" alt="Your photo">') +
        '<button type="button" class="media-remove" id="mediaRemove" aria-label="Remove">\u00D7</button>';

    preview.style.display = "block";
    document.getElementById("pickMedia").style.display = "none";

    if (isVideo) {
        const video = preview.querySelector("video");
        video.addEventListener("loadedmetadata", function () {
            document.getElementById("mediaDuration").textContent = formatDuration(video.duration);
        });
    }

    document.getElementById("mediaRemove").addEventListener("click", clearMedia);
});

// ---------- Tagging people in a post ----------

function renderTagChips() {
    document.getElementById("tagChips").innerHTML = taggedPeople.map(function (t) {
        return '<button type="button" class="chip active tag-chip" data-id="' + escapeHTML(t.id) + '">' +
            escapeHTML(t.name || "Member") + " \u00D7</button>";
    }).join("");
}

let tagTimer = null;

document.getElementById("tagSearch").addEventListener("input", function (event) {
    clearTimeout(tagTimer);

    tagTimer = setTimeout(async function () {
        const text = event.target.value.trim();
        const results = document.getElementById("tagResults");

        if (text.length < 2) {
            results.innerHTML = "";
            return;
        }

        const { data, error } = await db.rpc("find_members", { p_search: text });

        if (error || data.length === 0) {
            results.innerHTML = "<p class='meta'>No members found.</p>";
            return;
        }

        results.innerHTML = data.slice(0, 6).map(function (m) {
            return '<div class="member-row"><div class="member-link">' + avatarHTML(m.full_name, m.avatar_path, "avatar-sm") +
                "<span class='post-author'>" + escapeHTML(m.full_name || "Member") + "</span></div>" +
                '<button type="button" class="btn btn-outline tag-add" data-id="' + escapeHTML(m.id) +
                '" data-name="' + escapeHTML(m.full_name || "Member") + '">Tag</button></div>';
        }).join("");
    }, 300);
});

document.getElementById("tagResults").addEventListener("click", function (event) {
    const add = event.target.closest(".tag-add");
    if (!add) return;

    if (taggedPeople.length >= 5) {
        showPostNote("You can tag up to 5 people.", "error");
        return;
    }

    if (!taggedPeople.some(function (t) { return t.id === add.dataset.id; })) {
        taggedPeople.push({ id: add.dataset.id, name: add.dataset.name });
    }

    renderTagChips();
    document.getElementById("tagResults").innerHTML = "";
    document.getElementById("tagSearch").value = "";
});

document.getElementById("tagChips").addEventListener("click", function (event) {
    const chip = event.target.closest(".tag-chip");
    if (!chip) return;

    taggedPeople = taggedPeople.filter(function (t) { return t.id !== chip.dataset.id; });
    renderTagChips();
});

// ---------- Posting a lifestyle post ----------

postForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const caption = document.getElementById("postCaption").value.trim();
    const photo = mediaFile && mediaFile.type.startsWith("image/") ? mediaFile : null;
    const videoFile = mediaFile && mediaFile.type.startsWith("video/") ? mediaFile : null;
    const button = document.getElementById("postBtn");

    if (!caption && !photo && !videoFile) {
        showPostNote("Write something, or add a photo or a video.", "error");
        return;
    }

    button.disabled = true;

    let imagePath = null;
    let videoPath = null;

    try {
        if (videoFile) {
            showPostNote("Checking your video...", "ok");
            await checkVideoFile(videoFile);
        }

        if (photo) {
            showPostNote("Uploading your photo...", "ok");
            const blob = await compressImage(photo);
            imagePath = me.id + "/" + randomName() + ".jpg";

            const upload = await db.storage.from("post-images").upload(imagePath, blob, { contentType: "image/jpeg" });
            if (upload.error) throw upload.error;
        }

        if (videoFile) {
            showPostNote("Uploading your video. This can take a minute...", "ok");

            const extension = (videoFile.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
            videoPath = me.id + "/" + randomName() + "." + (extension || "mp4");

            const upload = await db.storage.from("post-videos").upload(videoPath, videoFile, { contentType: videoFile.type || "video/mp4" });
            if (upload.error) throw upload.error;
        }

        showPostNote("Posting...", "ok");

        // No title or category: this is a lifestyle post, kept separate from the marketplace
        const created = await db.rpc("create_post", {
            p_caption: caption,
            p_price: null,
            p_video_url: null,
            p_image_path: imagePath,
            p_video_path: videoPath,
            p_business_id: null
        });

        if (created.error) throw created.error;

        if (taggedPeople.length > 0) {
            await db.rpc("tag_post", {
                p_post_id: created.data,
                p_users: taggedPeople.map(function (t) { return t.id; })
            });
        }
    } catch (error) {
        if (imagePath) await db.storage.from("post-images").remove([imagePath]);
        if (videoPath) await db.storage.from("post-videos").remove([videoPath]);

        showPostNote(friendlyError(error), "error");
        button.disabled = false;
        return;
    }

    postForm.reset();
    clearMedia();
    taggedPeople = [];
    renderTagChips();
    button.disabled = false;
    showPostNote("");
    document.getElementById("composer").open = false;
    showToast("Posted");
    await loadFeed(true);
});

// ---------- Find members ----------

const memberSearch = document.getElementById("memberSearch");
const memberResults = document.getElementById("memberResults");
let searchTimer = null;
let currentRole = "";

memberSearch.addEventListener("input", function () {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async function () {
        const text = memberSearch.value.trim();

        if (text.length < 2 && !currentRole) {
            memberResults.innerHTML = "";
            return;
        }

        const { data, error } = await db.rpc("find_members", { p_search: text, p_role: currentRole || null });

        if (error) {
            memberResults.innerHTML = "<p class='meta'>" + escapeHTML(friendlyError(error)) + "</p>";
            return;
        }

        if (data.length === 0) {
            memberResults.innerHTML = "<p class='meta'>No members found.</p>";
            return;
        }

        memberResults.innerHTML = "";

        data.forEach(function (m) {
            const row = document.createElement("div");
            row.className = "member-row";

            row.innerHTML =
                '<a class="member-link" href="member.html?id=' + encodeURIComponent(m.id) + '">' +
                avatarHTML(m.full_name, m.avatar_path, "avatar-sm") +
                "<div><span class='post-author'>" + escapeHTML(m.full_name || "Member") + "</span>" + badgeHTML(m) +
                "<div class='post-time'>" + Number(m.follower_count) + " followers</div></div></a>" +
                followButton(m.id, m.i_follow);

            memberResults.appendChild(row);
        });
    }, 300);
});

document.getElementById("roleChips").addEventListener("click", function (event) {
    const chip = event.target.closest(".chip");
    if (!chip) return;

    document.querySelectorAll("#roleChips .chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");

    currentRole = chip.dataset.role;
    memberSearch.dispatchEvent(new Event("input"));
});


document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();