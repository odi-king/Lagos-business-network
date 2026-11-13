let me = null;
let feedMode = "all";
let marketFilter = "market";
let searchText = "";
let lastCreated = null;
let marketAvailable = true;

let postIntent = "offer";
let postItemType = "product";
let taggedPeople = [];
let mediaFile = null;
let previewUrl = null;

const feedList = document.getElementById("feedList");
const feedNote = document.getElementById("feedNote");
const loadMoreBtn = document.getElementById("loadMore");
const postForm = document.getElementById("postForm");
const postNote = document.getElementById("postNote");

const EMPTY_TEXT = {
    all: "No posts yet. Be the first to post.",
    market: "Nothing has been posted in the marketplace yet. Be the first.",
    selling: "Nothing is for sale yet.",
    services: "Nobody is offering a service yet.",
    wanted: "Nobody has asked for anything yet."
};

function showPostNote(text, type) {
    postNote.textContent = text;
    postNote.className = "msg " + (type || "");
}

async function init() {
    const member = await requireSocialMember();
    if (!member) return;

    // The marketplace is closed to anyone without marketplace access
    if (!member.marketOpen) {
        showMarketLock(member.profile);
        return;
    }

    me = member.user;

    // Students who have not graduated use the community now. The marketplace opens when they graduate.
    if (!member.marketOpen) {
        const waiting = member.profile && (member.profile.role === "lecturer" || member.profile.role === "business");

        const lock = document.getElementById("marketLock");
        lock.textContent = waiting
            ? "Your account is waiting for approval. Until then you can post lifestyle updates, follow people and send messages. The marketplace opens when you are approved."
            : "The marketplace opens when you graduate. Until then you can share lifestyle posts, follow people, comment and send messages.";
        lock.style.display = "block";

        document.querySelectorAll("#intentGrid .intent-card[data-intent]").forEach(function (card) {
            if (card.dataset.intent) card.classList.add("locked");
        });

        document.querySelectorAll("#filterChips .chip").forEach(function (chip) {
            if (["selling", "services", "wanted"].indexOf(chip.dataset.filter) !== -1) chip.style.display = "none";
        });
    }

    const tips = document.getElementById("tips");
    if (tips && localStorage.getItem("tipsClosed") !== "yes") {
        tips.style.display = "block";
    }

    mountPosts(feedList);
    applyIntent("offer", "product");
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

// ---------- Loading the marketplace ----------

async function fetchFeedPage(before) {
    if (marketAvailable) {
        const { data, error } = await db.rpc("market_posts", {
            p_search: searchText,
            p_filter: marketFilter,
            p_mode: feedMode,
            p_limit: 10,
            p_before: before
        });

        if (!error) return data;

        if (!/market_posts|schema cache|could not find/i.test(error.message)) throw error;

        // The database has not been updated with supabase-market.sql yet: use the plain feed
        marketAvailable = false;
        ["filterChips", "marketSearch", "intentGrid"].forEach(function (id) {
            document.getElementById(id).style.display = "none";
        });
    }

    return await fetchPosts(feedMode, null, before, false);
}

async function loadFeed(reset) {
    if (reset) {
        feedList.innerHTML = "";
        lastCreated = null;
        feedNote.textContent = "";
    }

    let posts;

    try {
        posts = await fetchFeedPage(lastCreated);
    } catch (error) {
        feedNote.textContent = "Could not load posts. " + friendlyError(error);
        return;
    }

    if (posts.length === 0 && reset) {
        if (searchText) {
            feedNote.textContent = 'Nothing found for "' + searchText + '". Try another word.';
        } else if (feedMode === "following") {
            feedNote.textContent = "Nothing here yet. Follow members to see their posts.";
        } else {
            feedNote.textContent = EMPTY_TEXT[marketFilter] || EMPTY_TEXT.all;
        }
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

document.querySelectorAll(".tabs .tab-btn").forEach(function (button) {
    button.addEventListener("click", function () {
        document.querySelectorAll(".tabs .tab-btn").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        feedMode = button.dataset.mode;
        loadFeed(true);
    });
});

document.getElementById("filterChips").addEventListener("click", function (event) {
    const chip = event.target.closest(".chip");
    if (!chip) return;

    document.querySelectorAll("#filterChips .chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");

    marketFilter = chip.dataset.filter;
    loadFeed(true);
});

let marketTimer = null;

document.getElementById("marketSearch").addEventListener("input", function (event) {
    clearTimeout(marketTimer);

    marketTimer = setTimeout(function () {
        searchText = event.target.value.trim();
        loadFeed(true);
    }, 350);
});

// ---------- What kind of post is it? ----------

const INTENT_TEXT = {
    "": { title: "", caption: "What do you want to share?", price: "Price in naira (optional)" },
    "offer-product": { title: "What are you selling?", caption: "Describe it: condition, size, where you are...", price: "Price in naira" },
    "offer-service": { title: "What service do you offer?", caption: "Describe what you do, your experience and where...", price: "Your price in naira (optional)" },
    "need-product": { title: "What do you need?", caption: "Describe what you are looking for...", price: "Your budget in naira (optional)" },
    "need-service": { title: "What service do you need?", caption: "Describe the job, the place and the timing...", price: "Your budget in naira (optional)" }
};

function applyIntent(intent, type) {
    postIntent = intent;
    postItemType = type;

    const text = INTENT_TEXT[intent ? intent + "-" + type : ""];
    const titleInput = document.getElementById("postTitle");

    titleInput.style.display = intent ? "" : "none";
    titleInput.placeholder = text.title;
    document.getElementById("postCaption").placeholder = text.caption;
    document.getElementById("postPrice").placeholder = text.price;

    document.querySelectorAll("#intentGrid .intent-card").forEach(function (card) {
        card.classList.toggle("selected", card.dataset.intent === intent && card.dataset.type === type);
    });
}

document.getElementById("intentGrid").addEventListener("click", function (event) {
    const card = event.target.closest(".intent-card");
    if (!card) return;
    if (card.classList.contains("locked")) {
        showPostNote("The marketplace opens when you graduate. You can share a lifestyle post now.", "error");
        return;
    }

    applyIntent(card.dataset.intent, card.dataset.type);
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

// ---------- Posting ----------

postForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = document.getElementById("postTitle").value.trim();
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

    if (postIntent && title.length < 3) {
        showPostNote("Give your post a title of at least 3 letters.", "error");
        return;
    }

    if (postIntent && caption.length < 10) {
        showPostNote("Describe it in a few words so people know what you mean.", "error");
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

        const params = {
            p_caption: caption,
            p_price: priceValue === "" ? null : parseInt(priceValue, 10),
            p_video_url: link || null,
            p_image_path: imagePath,
            p_video_path: videoPath,
            p_business_id: listing || null
        };

        // Only sales, services and requests send the extra details
        if (postIntent) {
            params.p_title = title;
            params.p_intent = postIntent;
            params.p_item_type = postItemType;
        }

        const created = await db.rpc("create_post", params);

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

        const message = friendlyError(error);
        showPostNote(
            /could not find the function|schema cache/i.test(message)
                ? "The marketplace needs its latest database update. Run supabase-market.sql in Supabase."
                : message,
            "error"
        );
        button.disabled = false;
        return;
    }

    postForm.reset();
    clearMedia();
    applyIntent("offer", "product");
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