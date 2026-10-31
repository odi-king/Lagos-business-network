const query = new URLSearchParams(window.location.search);
let memberId = query.get("id");

let viewerSession = null;
let profileRow = null;
let isOwn = false;
let followerCount = 0;
let lastCreated = null;

const profileBox = document.getElementById("profileBox");
const memberPosts = document.getElementById("memberPosts");
const memberNote = document.getElementById("memberNote");
const memberMore = document.getElementById("memberMore");
const editPanel = document.getElementById("editPanel");
const sheet = document.getElementById("sheet");

function profileLink() {
    return window.location.origin + window.location.pathname + "?id=" + encodeURIComponent(memberId);
}

async function shareProfile() {
    const url = profileLink();
    const name = (profileRow && profileRow.full_name) || "this member";

    if (navigator.share) {
        try {
            await navigator.share({
                title: name + " on Lagos Business Network",
                text: "Follow " + name + " on Lagos Business Network",
                url: url
            });
            return;
        } catch (error) {
            if (error.name === "AbortError") return;
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        showToast("Profile link copied");
    } catch (error) {
        prompt("Copy this link:", url);
    }
}

async function init() {
    if (!db) {
        profileBox.innerHTML = "<p class='meta'>Supabase is not connected yet. Check supabase-config.js.</p>";
        return;
    }

    const sessionResult = await db.auth.getSession();
    viewerSession = sessionResult.data.session;

    // "Me" opens your own profile
    if (!memberId || memberId === "me") {
        if (!viewerSession) {
            window.location.href = "auth.html?next=" + encodeURIComponent("member.html");
            return;
        }
        memberId = viewerSession.user.id;
    }

    isOwn = !!viewerSession && viewerSession.user.id === memberId;

    if (viewerSession && (await hasActiveMembership(viewerSession.user.id))) {
        const mine = await db.from("profiles").select("is_admin").eq("id", viewerSession.user.id).maybeSingle();

        postsContext.meId = viewerSession.user.id;
        postsContext.isAdmin = !!(mine.data && mine.data.is_admin);

        const full = await db.rpc("member_profile", { p_id: memberId });

        if (full.data && full.data[0]) {
            profileRow = full.data[0];
            await renderMember();
            return;
        }
    }

    // Visitors, unpaid members and people without marketplace access see a short preview
    const preview = await db.rpc("public_profile", { p_id: memberId });

    if (preview.data && preview.data[0]) {
        profileRow = preview.data[0];
        profileRow.i_follow = false;
        renderPreview();
        return;
    }

    if (isOwn) {
        window.location.href = "dashboard.html";
        return;
    }

    profileBox.innerHTML = "<h1>Member not found</h1><p class='meta'>This profile does not exist.</p>";
}

function statsHTML(clickable) {
    const p = profileRow;

    function stat(label, value, list) {
        const inner = "<strong>" + value + "</strong><span>" + label + "</span>";
        return clickable
            ? '<button type="button" class="stat-btn" data-list="' + list + '">' + inner + "</button>"
            : '<div class="stat-btn">' + inner + "</div>";
    }

    return '<div class="profile-stats">' +
        stat("posts", Number(p.post_count), "posts") +
        stat("followers", '<span id="followerCount">' + followerCount + "</span>", "followers") +
        stat("following", Number(p.following_count || 0), "following") +
        "</div>";
}

function headerHTML(clickable, actions) {
    const p = profileRow;
    const name = p.full_name || "Member";

    return `
        <div class="profile-top">
            ${avatarHTML(name, p.avatar_path, "avatar-xl")}
            ${statsHTML(clickable)}
        </div>
        <h1 class="profile-name">${escapeHTML(name)}${badgeHTML(p)}</h1>
        ${p.institution ? '<p class="profile-sub">' + escapeHTML(p.institution) + "</p>" : ""}
        ${p.bio ? '<p class="profile-bio">' + escapeHTML(p.bio) + "</p>" : ""}
        <div class="profile-actions">${actions}</div>
    `;
}

async function renderMember() {
    followerCount = Number(profileRow.follower_count);
    document.title = (profileRow.full_name || "Member") + " - Lagos Business Network";

    const actions = isOwn
        ? '<button type="button" class="btn btn-outline" id="editBtn">Edit profile</button>' +
          '<button type="button" class="btn btn-outline" id="shareBtn">Share profile</button>'
        : followButton(profileRow.id, profileRow.i_follow) +
          '<button type="button" class="btn btn-outline" id="messageBtn">Message</button>' +
          '<button type="button" class="btn btn-outline" id="shareBtn">Share</button>';

    profileBox.innerHTML = headerHTML(true, actions);

    if (isOwn) renderMenu();

    if (isOwn && query.get("edit") === "1") {
        const editButton = document.getElementById("editBtn");
        if (editButton) editButton.click();
    }

    document.getElementById("profileTabs").style.display = "flex";
    await loadPosts(true);
}

function renderPreview() {
    followerCount = Number(profileRow.follower_count);
    document.title = (profileRow.full_name || "Member") + " - Lagos Business Network";

    const next = encodeURIComponent("member.html?id=" + memberId);

    const actions = viewerSession
        ? '<button type="button" class="btn btn-outline" id="shareBtn">Share profile</button>'
        : '<a class="btn btn-primary" href="auth.html?next=' + next + '">Log in or join to follow</a>' +
          '<button type="button" class="btn btn-outline" id="shareBtn">Share</button>';

    profileBox.innerHTML = headerHTML(false, actions);

    memberNote.textContent = viewerSession
        ? "Posts are visible to marketplace members."
        : "Posts are visible to marketplace members. Log in or join to see them and follow.";
}

function renderMenu() {
    const items = [
        '<a class="menu-row" href="settings.html">Settings and activity</a>',
        '<a class="menu-row" href="notifications.html">Notifications</a>',
        '<a class="menu-row" href="library.html">Handouts and books</a>',
        '<a class="menu-row" href="dashboard.html">Dashboard</a>',
        '<a class="menu-row" href="trades.html">My trades</a>',
        '<a class="menu-row" href="live.html">Live classes</a>'
    ];

    if (postsContext.isAdmin) items.push('<a class="menu-row" href="admin.html">Admin</a>');

    items.push('<a class="menu-row" href="contact.html">Customer care</a>');

    document.getElementById("profileMenu").innerHTML = '<div class="menu">' + items.join("") + "</div>";
}

async function reloadProfile() {
    const full = await db.rpc("member_profile", { p_id: memberId });
    if (full.data && full.data[0]) {
        profileRow = full.data[0];
        followerCount = Number(profileRow.follower_count);
        profileBox.innerHTML = headerHTML(true,
            '<button type="button" class="btn btn-outline" id="editBtn">Edit profile</button>' +
            '<button type="button" class="btn btn-outline" id="shareBtn">Share profile</button>');
    }
}

// ---------- Posts on this profile ----------

// ---------- The four tabs: Posts, Reels, Reposts, Tagged ----------

let currentTab = "posts";
let reelsOrder = "latest";

const EMPTY_TEXT = {
    posts: "No posts yet.",
    reels: "No videos yet.",
    reposts: "Nothing reposted yet.",
    tagged: "Nobody has tagged this member yet."
};

const EYE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

function compact(value) {
    const n = Number(value) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
}

async function fetchTab(tab, before) {
    if (tab === "reposts" || tab === "tagged") {
        const { data, error } = await db.rpc(tab === "reposts" ? "profile_reposts" : "profile_tagged", {
            p_user: memberId,
            p_limit: 30,
            p_before: before
        });

        if (error) throw error;
        return data;
    }

    return await fetchPosts("all", memberId, before, tab === "reels", 30);
}

async function appendGrid(posts) {
    const media = await signMedia(posts);
    const ordered = currentTab === "reels" && reelsOrder === "popular"
        ? posts.slice().sort(function (a, b) { return Number(b.view_count) - Number(a.view_count); })
        : posts;

    ordered.forEach(function (p) {
        const tile = document.createElement("a");
        tile.className = "grid-tile";
        tile.href = "post.html?id=" + encodeURIComponent(p.id);

        let inner;

        if (p.video_path && media.videos[p.video_path]) {
            inner = '<video src="' + escapeHTML(media.videos[p.video_path]) + '#t=0.1" muted playsinline preload="metadata"></video>';
        } else if (p.image_path && media.images[p.image_path]) {
            inner = '<img src="' + escapeHTML(media.images[p.image_path]) + '" alt="" loading="lazy">';
        } else if (p.video_url) {
            inner = '<div class="tile-text">Video</div>';
        } else {
            inner = '<div class="tile-text">' + escapeHTML((p.caption || "").slice(0, 120)) + "</div>";
        }

        const isVideo = !!(p.video_path || p.video_url);

        if (isVideo) {
            inner += '<span class="tile-views">' + EYE_ICON + compact(p.view_count) + "</span>";
            if (currentTab !== "reels") inner += '<span class="tile-play">\u25B6</span>';
        }

        tile.innerHTML = inner;
        memberPosts.appendChild(tile);
    });
}

async function loadPosts(reset) {
    if (reset) {
        memberPosts.innerHTML = "";
        memberPosts.className = "profile-grid" + (currentTab === "reels" ? " reels-grid" : "");
        lastCreated = null;
        memberNote.textContent = "";
    }

    let posts;

    try {
        posts = await fetchTab(currentTab, lastCreated);
    } catch (error) {
        memberNote.textContent = "Could not load this tab. " + friendlyError(error);
        return;
    }

    if (posts.length === 0 && reset) {
        memberNote.textContent = isOwn && currentTab === "posts"
            ? "You have not posted yet. Share what you sell on the Marketplace page."
            : EMPTY_TEXT[currentTab];
    }

    await appendGrid(posts);

    if (posts.length > 0) {
        lastCreated = posts[posts.length - 1].created_at;
    }

    memberMore.style.display = posts.length === 30 ? "" : "none";
}

document.getElementById("profileTabs").addEventListener("click", function (event) {
    const tab = event.target.closest(".ptab");
    if (!tab) return;

    document.querySelectorAll(".ptab").forEach(function (t) { t.classList.remove("active"); });
    tab.classList.add("active");

    currentTab = tab.dataset.tab;
    document.getElementById("reelsSort").style.display = currentTab === "reels" ? "flex" : "none";

    loadPosts(true);
});

document.getElementById("reelsSort").addEventListener("click", function (event) {
    const chip = event.target.closest(".chip");
    if (!chip) return;

    document.querySelectorAll("#reelsSort .chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");

    reelsOrder = chip.dataset.sort;
    loadPosts(true);
});

memberMore.addEventListener("click", function () {
    loadPosts(false);
});

document.addEventListener("follow-changed", function (event) {
    if (event.detail.author !== memberId) return;

    followerCount += event.detail.following ? 1 : -1;
    const counter = document.getElementById("followerCount");
    if (counter) counter.textContent = followerCount;
});

// ---------- Followers and following lists ----------

async function openList(kind) {
    const isFollowers = kind === "followers";

    document.getElementById("sheetTitle").textContent = isFollowers ? "Followers" : "Following";
    document.getElementById("sheetBody").innerHTML = "<p class='meta'>Loading...</p>";
    sheet.style.display = "flex";

    const { data, error } = await db.rpc(isFollowers ? "list_followers" : "list_following", { p_id: memberId });
    const body = document.getElementById("sheetBody");

    if (error) {
        body.innerHTML = "<p class='meta'>" + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        body.innerHTML = "<p class='meta'>" + (isFollowers ? "No followers yet." : "Not following anyone yet.") + "</p>";
        return;
    }

    body.innerHTML = "";

    data.forEach(function (m) {
        const row = document.createElement("div");
        row.className = "member-row";

        row.innerHTML =
            '<a class="member-link" href="member.html?id=' + encodeURIComponent(m.id) + '">' +
            avatarHTML(m.full_name, m.avatar_path, "avatar-sm") +
            "<div><span class='post-author'>" + escapeHTML(m.full_name || "Member") + "</span>" + badgeHTML(m) + "</div></a>" +
            followButton(m.id, m.i_follow);

        body.appendChild(row);
    });
}

document.getElementById("sheetClose").addEventListener("click", function () {
    sheet.style.display = "none";
});

sheet.addEventListener("click", function (event) {
    if (event.target === sheet) sheet.style.display = "none";
});

// ---------- Clicks on the profile header ----------

profileBox.addEventListener("click", function (event) {
    const stat = event.target.closest(".stat-btn[data-list]");

    if (stat) {
        if (stat.dataset.list === "posts") {
            memberPosts.scrollIntoView({ behavior: "smooth" });
        } else {
            openList(stat.dataset.list);
        }
        return;
    }

    if (event.target.closest("#messageBtn")) {
        db.rpc("start_conversation", { p_other: memberId }).then(function (result) {
            if (result.error) {
                alert(friendlyError(result.error));
                return;
            }
            window.location.href = "chat.html?id=" + encodeURIComponent(result.data);
        });
        return;
    }

    if (event.target.closest("#shareBtn")) {
        shareProfile();
        return;
    }

    if (event.target.closest("#editBtn")) {
        document.getElementById("editName").value = profileRow.full_name || "";
        document.getElementById("editBio").value = profileRow.bio || "";
        document.getElementById("editNote").textContent = "";
        document.getElementById("editRemovePhoto").checked = false;
        editPanel.style.display = "block";
        editPanel.scrollIntoView({ behavior: "smooth" });
    }
});

// ---------- Edit profile ----------

document.getElementById("editCancel").addEventListener("click", function () {
    editPanel.style.display = "none";
});

document.getElementById("editForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const note = document.getElementById("editNote");
    const button = document.getElementById("editSave");
    const file = document.getElementById("editPhoto").files[0];
    const remove = document.getElementById("editRemovePhoto").checked;
    const oldPath = profileRow.avatar_path;

    button.disabled = true;
    note.className = "msg ok";
    note.textContent = "Saving...";

    let newPath = null;

    try {
        if (file) {
            const blob = await compressSquare(file, 320);
            newPath = viewerSession.user.id + "/" + randomName() + ".jpg";

            const upload = await db.storage.from("avatars").upload(newPath, blob, { contentType: "image/jpeg" });
            if (upload.error) throw upload.error;
        }

        const { error } = await db.rpc("update_my_profile", {
            p_name: document.getElementById("editName").value,
            p_bio: document.getElementById("editBio").value,
            p_avatar_path: newPath,
            p_clear_avatar: remove && !newPath
        });

        if (error) throw error;
    } catch (error) {
        if (newPath) await db.storage.from("avatars").remove([newPath]);

        note.className = "msg error";
        note.textContent = error.message;
        button.disabled = false;
        return;
    }

    if (oldPath && (newPath || remove)) {
        await db.storage.from("avatars").remove([oldPath]);
    }

    button.disabled = false;
    document.getElementById("editPhoto").value = "";
    editPanel.style.display = "none";
    showToast("Profile saved");

    await reloadProfile();
    renderMenu();
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();