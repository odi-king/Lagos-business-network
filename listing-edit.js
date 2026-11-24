const listingId = new URLSearchParams(window.location.search).get("id");
const leMsg = document.getElementById("leMsg");
let uid = null;
let coverPath = null;
// Each entry: { path, url, file }. A file means "not uploaded yet".
let photos = [];
let originalPaths = [];
const MAX_PHOTOS = 6;

function say(text, kind) {
    leMsg.textContent = text || "";
    leMsg.className = "msg " + (kind || "");
}

function draw() {
    const box = document.getElementById("lePhotos");
    box.innerHTML = photos.length === 0 ? "<p class='meta'>No photos yet.</p>" : photos.map(function (p, i) {
        return '<div data-i="' + i + '" style="width:110px;text-align:center;">' +
            '<img src="' + escapeHTML(p.url) + '" alt="Photo ' + (i + 1) + '" style="width:110px;height:110px;object-fit:cover;border-radius:8px;">' +
            '<div class="meta">' + (i === 0 ? "Cover" : "Photo " + (i + 1)) + "</div>" +
            (i > 0 ? '<a href="#" class="le-cover">Make cover</a><br>' : "") +
            '<a href="#" class="le-remove">Remove</a></div>';
    }).join("");
    document.getElementById("leAdd").style.display = photos.length >= MAX_PHOTOS ? "none" : "";
}

document.getElementById("lePhotos").addEventListener("click", function (event) {
    const card = event.target.closest("[data-i]");
    if (!card) return;
    const i = parseInt(card.dataset.i, 10);
    if (event.target.closest(".le-remove")) {
        event.preventDefault();
        const gone = photos.splice(i, 1)[0];
        if (gone.file && gone.url) URL.revokeObjectURL(gone.url);
        draw();
    } else if (event.target.closest(".le-cover")) {
        event.preventDefault();
        const moved = photos.splice(i, 1)[0];
        photos.unshift(moved);
        draw();
    }
});

document.getElementById("leAdd").addEventListener("click", function () { document.getElementById("leFiles").click(); });

document.getElementById("leFiles").addEventListener("change", function (event) {
    const files = Array.prototype.slice.call(event.target.files || []);
    event.target.value = "";
    files.forEach(function (file) {
        if (photos.length >= MAX_PHOTOS) return;
        if (!/^image\//.test(file.type)) { say("Only photos can be added.", "error"); return; }
        photos.push({ path: null, url: URL.createObjectURL(file), file: file });
    });
    draw();
});

async function uploadPhoto(file) {
    const blob = await compressImage(file);
    const path = uid + "/" + randomName() + ".jpg";
    const up = await db.storage.from("post-images").upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    return path;
}

document.getElementById("leSave").addEventListener("click", async function () {
    const button = this;
    button.disabled = true;
    say("Saving...", "ok");
    const uploaded = [];

    try {
        // 1. upload any new photos
        for (const p of photos) {
            if (p.file) {
                p.path = await uploadPhoto(p.file);
                uploaded.push(p.path);
            }
        }

        // 2. the first photo is the cover. Changing the cover needs the cover set on the post itself.
        const newCover = photos.length ? photos[0].path : null;
        const extras = photos.slice(1).map(function (p) { return p.path; });

        const det = await db.rpc("post_set_details", {
            p_post: listingId, p_category: document.getElementById("leCategory").value || null,
            p_state: document.getElementById("leState").value || null, p_area: document.getElementById("leArea").value || null
        });
        if (det.error) throw det.error;

        if (newCover !== coverPath) {
            const cov = await db.rpc("post_set_cover", { p_post: listingId, p_path: newCover });
            if (cov.error) throw cov.error;
        }

        const set = await db.rpc("post_set_photos", { p_post: listingId, p_paths: extras });
        if (set.error) throw set.error;

        // 3. delete files that are no longer used
        const keep = photos.map(function (p) { return p.path; });
        const stale = originalPaths.filter(function (path) { return keep.indexOf(path) === -1; });
        if (stale.length) await db.storage.from("post-images").remove(stale);

        say("Saved.", "ok");
        setTimeout(function () { window.location.href = "post.html?id=" + encodeURIComponent(listingId); }, 600);
    } catch (error) {
        if (uploaded.length) await db.storage.from("post-images").remove(uploaded);
        const m = friendlyError(error);
        say(/could not find the function|schema cache/i.test(m) ? "Not set up yet. Run supabase-market-3.sql in Supabase." : m, "error");
        button.disabled = false;
    }
});

async function sign(paths) {
    if (!paths.length) return {};
    const { data } = await db.storage.from("post-images").createSignedUrls(paths, 3600);
    const map = {};
    (data || []).forEach(function (item) { if (item.signedUrl) map[item.path] = item.signedUrl; });
    return map;
}

(async function init() {
    if (!db) { say("Supabase is not connected yet.", "error"); return; }
    if (!listingId) { window.location.href = "feed.html"; return; }
    const { data } = await db.auth.getSession();
    if (!data.session) { window.location.href = "auth.html?next=" + encodeURIComponent("listing-edit.html?id=" + listingId); return; }
    uid = data.session.user.id;

    const r = await db.rpc("my_listing", { p_post: listingId });
    if (r.error) {
        say(/could not find the function|schema cache/i.test(r.error.message) ? "Not set up yet. Run supabase-market-3.sql in Supabase." : friendlyError(r.error), "error");
        return;
    }
    const l = r.data;
    document.getElementById("leTitle").textContent = l.title || "";
    coverPath = l.image_path || null;

    const cats = await db.rpc("market_category_list");
    document.getElementById("leCategory").innerHTML = '<option value="">No category</option>' + (cats.data || []).filter(function (c) {
        return c.item_type === l.item_type;
    }).map(function (c) { return '<option value="' + escapeHTML(c.name) + '">' + escapeHTML(c.name) + "</option>"; }).join("");
    document.getElementById("leCategory").value = l.category || "";
    document.getElementById("leState").value = l.state || "";
    document.getElementById("leArea").value = l.area || "";

    const paths = (coverPath ? [coverPath] : []).concat(l.photos || []);
    originalPaths = paths.slice();
    const urls = await sign(paths);
    photos = paths.filter(function (p) { return urls[p]; }).map(function (p) { return { path: p, url: urls[p], file: null }; });
    draw();
    document.getElementById("leBox").style.display = "";
})();