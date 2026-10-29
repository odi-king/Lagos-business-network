let me = null;
let feedMode = "all";
let lastCreated = null;

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
    const member = await requireMarketplaceMember();
    if (!member) return;

    me = member.user;

    const tips = document.getElementById("tips");
    if (tips && localStorage.getItem("tipsClosed") !== "yes") {
        tips.style.display = "block";
    }

    mountPosts(feedList);
    await loadMyListings();
    await loadFeed(true);
}

async function loadMyListings() {
    const { data } = await db
        .from("businesses")
        .select("id, name")
        .eq("owner_id", me.id)
        .order("created_at", { ascending: false });

    const select = document.getElementById("postListing");

    (data || []).forEach(function (item) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });
}

async function loadFeed(reset) {
    if (reset) {
        feedList.innerHTML = "";
        lastCreated = null;
        feedNote.textContent = "";
    }

    let posts;

    try {
        posts = await fetchPosts(feedMode, null, lastCreated, false);
    } catch (error) {
        feedNote.textContent = "Could not load posts. " + friendlyError(error);
        return;
    }

    if (posts.length === 0 && reset) {
        feedNote.textContent = feedMode === "following"
            ? "Nothing here yet. Follow members to see their posts."
            : "No posts yet. Be the first to post.";
    }

    await appendPosts(feedList, posts);

    if (posts.length > 0) {
        lastCreated = posts[posts.length - 1].created_at;
    }

    loadMoreBtn.style.display = posts.length === 10 ? "" : "none";
}

loadMoreBtn.addEventListener("click", function () {
    loadFeed(false);
});

document.querySelectorAll(".tab-btn").forEach(function (button) {
    button.addEventListener("click", function () {
        document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        feedMode = button.dataset.mode;
        loadFeed(true);
    });
});

// ---------- Picking a photo or video from the phone gallery ----------

let mediaFile = null;
let previewUrl = null;

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

// ---------- Posting ----------

postForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const caption = document.getElementById("postCaption").value.trim();
    const priceValue = document.getElementById("postPrice").value;
    const link = document.getElementById("postVideo").value.trim();
    const photo = mediaFile && mediaFile.type.startsWith("image/") ? mediaFile : null;
    const videoFile = mediaFile && mediaFile.type.startsWith("video/") ? mediaFile : null;
    const listing = document.getElementById("postListing").value;
    const button = document.getElementById("postBtn");

    if (link && !toEmbedUrl(link)) {
        showPostNote("Please use a YouTube, Vimeo or Google Drive video link.", "error");
        return;
    }

    if (!caption && !link && !photo && !videoFile) {
        showPostNote("Add a caption, a photo or a video.", "error");
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

            const upload = await db.storage.from("post-videos").upload(videoPath, videoFile, {
                contentType: videoFile.type || "video/mp4"
            });
            if (upload.error) throw upload.error;
        }

        showPostNote("Posting...", "ok");

        const { error } = await db.rpc("create_post", {
            p_caption: caption,
            p_price: priceValue === "" ? null : parseInt(priceValue, 10),
            p_video_url: link || null,
            p_image_path: imagePath,
            p_video_path: videoPath,
            p_business_id: listing || null
        });

        if (error) throw error;
    } catch (error) {
        if (imagePath) await db.storage.from("post-images").remove([imagePath]);
        if (videoPath) await db.storage.from("post-videos").remove([videoPath]);

        showPostNote(friendlyError(error), "error");
        button.disabled = false;
        return;
    }

    postForm.reset();
    clearMedia();
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
            memberResults.innerHTML = "<p class='meta'>" + escapeHTML(error.message) + "</p>";
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

document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
        document.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        currentRole = chip.dataset.role;
        memberSearch.dispatchEvent(new Event("input"));
    });
});

document.getElementById("tipsClose").addEventListener("click", function () {
    localStorage.setItem("tipsClosed", "yes");
    document.getElementById("tips").style.display = "none";
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();