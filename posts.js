const postId = new URLSearchParams(window.location.search).get("id");

const postBox = document.getElementById("postBox");
const previewBox = document.getElementById("previewBox");
const postNote = document.getElementById("postNote");

async function init() {
    if (!db) {
        postNote.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    if (!postId) {
        window.location.href = "feed.html";
        return;
    }

    const sessionResult = await db.auth.getSession();
    const session = sessionResult.data.session;

    // Marketplace members see the whole post, with comments open
    if (session && (await hasActiveMembership(session.user.id))) {
        const mine = await db.from("profiles").select("is_admin").eq("id", session.user.id).maybeSingle();

        postsContext.meId = session.user.id;
        postsContext.isAdmin = !!(mine.data && mine.data.is_admin);

        const full = await db.rpc("get_post", { p_id: postId });

        if (full.data && full.data[0]) {
            mountPosts(postBox);
            await appendPosts(postBox, [full.data[0]]);

            const card = postBox.querySelector(".post-card");
            if (card) await toggleComments(card);
            return;
        }
    }

    // Everyone else sees a short preview with a way to join
    const preview = await db.rpc("public_post_preview", { p_id: postId });

    if (!preview.data || !preview.data[0]) {
        postNote.textContent = "This post is not available. It may have been deleted.";
        return;
    }

    const p = preview.data[0];
    const next = encodeURIComponent("post.html?id=" + postId);

    const what = p.kind === "video" ? "this video" : p.kind === "photo" ? "this photo" : "this post";

    const action = session
        ? '<p class="notice">The marketplace is not open to you yet, so you cannot see ' + what + ' here.</p>' +
          '<a class="btn btn-primary" href="dashboard.html">Go to my dashboard</a>'
        : '<a class="btn btn-primary" href="auth.html?next=' + next + '">Log in or join to see ' + what + "</a>";

    previewBox.innerHTML = `
        <article class="post-card" style="margin-top:16px;">
            <div class="post-head">
                <span class="post-person">${avatarHTML(p.author_name, p.author_avatar, "avatar-sm")}</span>
                <div class="post-who">
                    <span class="post-author">${escapeHTML(p.author_name || "Member")}</span>${badgeHTML({
                        role: p.author_role, approved: p.author_approved, verified: p.author_verified, is_admin: p.author_is_admin
                    })}
                    <div class="post-time">${timeAgo(p.created_at)}</div>
                </div>
            </div>
            ${p.price !== null ? '<div class="post-price">' + formatPrice(p.price) + "</div>" : ""}
            ${p.caption ? '<div class="post-caption">' + escapeHTML(p.caption) + "</div>" : ""}
            <div style="padding:14px;">
                <p class="meta">Photos, videos and comments are only for members of Lagos Business Network.</p>
                ${action}
            </div>
        </article>
    `;
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();