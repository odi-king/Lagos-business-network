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
    if (!db) {
        feedNote.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    me = data.session.user;

    if (!(await hasActiveMembership(me.id))) {
        window.location.href = "pay.html";
        return;
    }

    const result = await db
        .from("profiles")
        .select("role, approved, graduated, is_admin")
        .eq("id", me.id)
        .single();

    const profile = result.data;
    const allowed = profile && (
        profile.is_admin ||
        (profile.role === "lecturer" && profile.approved) ||
        (profile.role === "student" && profile.graduated)
    );

    if (!allowed) {
        const waiting = profile && profile.role === "lecturer";
        document.querySelector("main").innerHTML = `
            <div class="page-head"><h1>Marketplace</h1></div>
            <section class="panel">
                <h2>The marketplace is not open to you yet</h2>
                <p class="meta">${waiting
                    ? "Your lecturer account is still being verified. The marketplace opens as soon as it is approved."
                    : "Students unlock the marketplace after finishing the one-year program."}</p>
                <a href="classes.html" class="btn btn-primary" style="margin-top:10px;">Go to classes</a>
            </section>`;
        return;
    }

    postsContext.meId = me.id;
    postsContext.isAdmin = !!profile.is_admin;

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
        posts = await fetchPosts(feedMode, null, lastCreated);
    } catch (error) {
        feedNote.textContent = "Could not load posts. " + error.message;
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

// ---------- Posting ----------

// Shrinks a photo so it loads fast and saves storage
function compressImage(file) {
    return new Promise(function (resolve, reject) {
        if (!file.type.startsWith("image/")) {
            reject(new Error("Please choose a photo."));
            return;
        }

        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = function () {
            const max = 1280;
            let width = image.width;
            let height = image.height;

            if (width > max || height > max) {
                const ratio = Math.min(max / width, max / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(image, 0, 0, width, height);
            URL.revokeObjectURL(url);

            canvas.toBlob(function (blob) {
                if (!blob) {
                    reject(new Error("Could not read the photo."));
                } else if (blob.size > 3 * 1024 * 1024) {
                    reject(new Error("That photo is too large. Try a smaller one."));
                } else {
                    resolve(blob);
                }
            }, "image/jpeg", 0.8);
        };

        image.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error("Could not read the photo."));
        };

        image.src = url;
    });
}

function randomName() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now() + "-" + Math.floor(Math.random() * 1000000);
}

postForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const caption = document.getElementById("postCaption").value.trim();
    const priceValue = document.getElementById("postPrice").value;
    const video = document.getElementById("postVideo").value.trim();
    const file = document.getElementById("postImage").files[0];
    const listing = document.getElementById("postListing").value;
    const button = document.getElementById("postBtn");

    if (video && !toEmbedUrl(video)) {
        showPostNote("Please use a YouTube, Vimeo or Google Drive video link.", "error");
        return;
    }

    if (!caption && !video && !file) {
        showPostNote("Add a caption, a photo or a video.", "error");
        return;
    }

    button.disabled = true;
    showPostNote("Posting...", "ok");

    let imagePath = null;

    try {
        if (file) {
            const blob = await compressImage(file);
            imagePath = me.id + "/" + randomName() + ".jpg";

            const upload = await db.storage.from("post-images").upload(imagePath, blob, {
                contentType: "image/jpeg"
            });

            if (upload.error) throw upload.error;
        }

        const { error } = await db.rpc("create_post", {
            p_caption: caption,
            p_price: priceValue === "" ? null : parseInt(priceValue, 10),
            p_video_url: video || null,
            p_image_path: imagePath,
            p_business_id: listing || null
        });

        if (error) throw error;
    } catch (error) {
        if (imagePath) {
            await db.storage.from("post-images").remove([imagePath]);
        }

        showPostNote(error.message, "error");
        button.disabled = false;
        return;
    }

    postForm.reset();
    button.disabled = false;
    showPostNote("Posted.", "ok");
    await loadFeed(true);
});

// ---------- Find members ----------

const memberSearch = document.getElementById("memberSearch");
const memberResults = document.getElementById("memberResults");
let searchTimer = null;

memberSearch.addEventListener("input", function () {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async function () {
        const text = memberSearch.value.trim();

        if (text.length < 2) {
            memberResults.innerHTML = "";
            return;
        }

        const { data, error } = await db.rpc("find_members", { p_search: text });

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
                "<div><a class='post-author' href='member.html?id=" + encodeURIComponent(m.id) + "'>" +
                escapeHTML(m.full_name || "Member") + "</a>" + badgeHTML(m) +
                "<div class='post-time'>" + Number(m.follower_count) + " followers</div></div>" +
                followButton(m.id, m.i_follow);

            memberResults.appendChild(row);
        });
    }, 300);
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();