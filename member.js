const memberId = new URLSearchParams(window.location.search).get("id");

let lastCreated = null;
let followerCount = 0;

const memberPosts = document.getElementById("memberPosts");
const memberNote = document.getElementById("memberNote");
const memberMore = document.getElementById("memberMore");

async function init() {
    if (!db) {
        memberNote.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    if (!memberId) {
        window.location.href = "feed.html";
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    const user = data.session.user;

    if (!(await hasActiveMembership(user.id))) {
        window.location.href = "pay.html";
        return;
    }

    const mine = await db.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();

    postsContext.meId = user.id;
    postsContext.isAdmin = !!(mine.data && mine.data.is_admin);

    const result = await db.rpc("member_profile", { p_id: memberId });
    const person = result.data && result.data[0];

    if (result.error || !person) {
        document.getElementById("profileName").textContent = "Member not found";
        memberNote.textContent = "This member does not exist, or the marketplace is not open to you yet.";
        return;
    }

    followerCount = Number(person.follower_count);

    document.title = (person.full_name || "Member") + " - Lagos Business Network";
    document.getElementById("profileName").innerHTML =
        escapeHTML(person.full_name || "Member") + badgeHTML(person);

    document.getElementById("profileMeta").textContent =
        person.institution ? person.institution : "";

    renderStats(person);

    document.getElementById("profileFollow").innerHTML = followButton(person.id, person.i_follow);

    mountPosts(memberPosts);
    await loadPosts(true);
}

let currentPerson = null;

function renderStats(person) {
    currentPerson = person;

    document.getElementById("profileStats").innerHTML =
        "<div><strong>" + Number(person.post_count) + "</strong>posts</div>" +
        "<div><strong id='followerCount'>" + followerCount + "</strong>followers</div>" +
        "<div><strong>" + Number(person.following_count) + "</strong>following</div>";
}

document.addEventListener("follow-changed", function (event) {
    if (event.detail.author !== memberId || !currentPerson) return;

    followerCount += event.detail.following ? 1 : -1;
    document.getElementById("followerCount").textContent = followerCount;
});

async function loadPosts(reset) {
    if (reset) {
        memberPosts.innerHTML = "";
        lastCreated = null;
    }

    let posts;

    try {
        posts = await fetchPosts("all", memberId, lastCreated);
    } catch (error) {
        memberNote.textContent = "Could not load posts. " + error.message;
        return;
    }

    if (posts.length === 0 && reset) {
        memberNote.textContent = "No posts yet.";
    }

    await appendPosts(memberPosts, posts);

    if (posts.length > 0) {
        lastCreated = posts[posts.length - 1].created_at;
    }

    memberMore.style.display = posts.length === 10 ? "" : "none";
}

memberMore.addEventListener("click", function () {
    loadPosts(false);
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();