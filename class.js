const classId = new URLSearchParams(window.location.search).get("id");

let currentUser = null;
let currentClass = null;
let isOwner = false;

const lessonList = document.getElementById("lessonList");
const liveList = document.getElementById("liveList");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Turns a normal video link into a safe embeddable one.
// Only YouTube, Vimeo and Google Drive are accepted.
function toEmbedUrl(link) {
    let url;
    try {
        url = new URL(String(link).trim());
    } catch (e) {
        return null;
    }

    if (url.protocol !== "https:") return null;

    const host = url.hostname.replace(/^www\./, "");
    let id = null;

    if (host === "youtu.be") {
        id = url.pathname.slice(1);
    } else if (host === "youtube.com" || host === "m.youtube.com") {
        if (url.pathname === "/watch") {
            id = url.searchParams.get("v");
        } else {
            const match = url.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/);
            if (match) id = match[2];
        }
    }

    if (id && /^[\w-]{6,}$/.test(id)) {
        return "https://www.youtube.com/embed/" + id;
    }

    if (host === "vimeo.com") {
        const match = url.pathname.match(/^\/(\d+)/);
        if (match) return "https://player.vimeo.com/video/" + match[1];
    }

    if (host === "drive.google.com") {
        const match = url.pathname.match(/^\/file\/d\/([\w-]+)/);
        if (match) return "https://drive.google.com/file/d/" + match[1] + "/preview";
    }

    return null;
}

async function init() {
    if (!db) {
        document.getElementById("classTitle").textContent = "Supabase is not connected yet.";
        return;
    }

    if (!classId) {
        window.location.href = "classes.html";
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    if (!(await hasActiveMembership(currentUser.id))) {
        window.location.href = "pay.html";
        return;
    }

    const result = await db
        .from("classes")
        .select("*, profiles(full_name, institution)")
        .eq("id", classId)
        .maybeSingle();

    if (result.error || !result.data) {
        document.getElementById("classTitle").textContent = "Class not found";
        return;
    }

    currentClass = result.data;
    isOwner = currentClass.lecturer_id === currentUser.id;

    const lecturer = currentClass.profiles && currentClass.profiles.full_name
        ? currentClass.profiles.full_name
        : "Lecturer";

    document.title = currentClass.title + " - Lagos Business Network";
    document.getElementById("classTitle").textContent = currentClass.title;
    const institution = currentClass.profiles && currentClass.profiles.institution
        ? currentClass.profiles.institution
        : "";

    document.getElementById("classMeta").innerHTML =
        escapeHTML(currentClass.field) + " &bull; Taught by " + escapeHTML(lecturer) +
        ' <span class="badge lecturer">Verified lecturer</span>' +
        (institution ? "<br>" + escapeHTML(institution) : "");
    document.getElementById("classDesc").textContent = currentClass.description || "";

    if (isOwner) {
        document.getElementById("ownerPanel").style.display = "block";
    }

    await Promise.all([loadLessons(), loadLive()]);

    // Links from the dashboard jump straight to the lesson or live class form
    if (isOwner && (location.hash === "#addLesson" || location.hash === "#addLive")) {
        const target = document.querySelector(location.hash);
        if (target) target.scrollIntoView();
    }
}

// ---------- Video lessons ----------

async function loadLessons() {
    const { data, error } = await db
        .from("lessons")
        .select("*")
        .eq("class_id", classId)
        .order("created_at", { ascending: true });

    if (error) {
        lessonList.innerHTML = "<p>Could not load lessons. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        lessonList.innerHTML = "<p class='meta'>No video lessons yet.</p>";
        return;
    }

    lessonList.innerHTML = "";

    data.forEach(function (lesson, index) {
        const embed = toEmbedUrl(lesson.video_url);
        const card = document.createElement("div");
        card.className = "business-card";

        const watch = embed
            ? '<button type="button" class="contact-btn watch-btn" data-embed="' + escapeHTML(embed) + '">Watch</button>'
            : '<a class="contact-btn" target="_blank" rel="noopener" href="' + escapeHTML(lesson.video_url) + '">Open video</a>';

        const remove = isOwner
            ? '<button type="button" class="delete-btn" data-kind="lessons" data-id="' + escapeHTML(lesson.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${index + 1}. ${escapeHTML(lesson.title)}</h3>
            <div class="video-slot"></div>
            ${watch}
            ${remove}
        `;

        lessonList.appendChild(card);
    });
}

lessonList.addEventListener("click", function (event) {
    const button = event.target.closest(".watch-btn");
    if (!button) return;

    const slot = button.parentElement.querySelector(".video-slot");

    if (slot.firstChild) {
        slot.innerHTML = "";
        button.textContent = "Watch";
        return;
    }

    const wrap = document.createElement("div");
    wrap.className = "video-wrap";

    const frame = document.createElement("iframe");
    frame.src = button.dataset.embed;
    frame.loading = "lazy";
    frame.allowFullscreen = true;
    frame.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");

    wrap.appendChild(frame);
    slot.appendChild(wrap);
    button.textContent = "Close video";
});

// ---------- Live classes ----------

async function loadLive() {
    const { data, error } = await db
        .from("live_sessions")
        .select("*")
        .eq("class_id", classId)
        .order("starts_at", { ascending: true });

    if (error) {
        liveList.innerHTML = "<p>Could not load live classes. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        liveList.innerHTML = "<p class='meta'>No live classes scheduled yet.</p>";
        return;
    }

    liveList.innerHTML = "";
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

    data.forEach(function (session) {
        const start = new Date(session.starts_at);
        const finished = start.getTime() < threeHoursAgo;
        const card = document.createElement("div");
        card.className = "business-card";

        const join = finished
            ? '<p class="meta">This live class has ended.</p>'
            : '<a class="contact-btn" target="_blank" rel="noopener" href="' + escapeHTML(session.join_url) + '">Join live class</a>';

        const remove = isOwner
            ? '<button type="button" class="delete-btn" data-kind="live_sessions" data-id="' + escapeHTML(session.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(session.title)}</h3>
            <p class="meta">${escapeHTML(start.toLocaleString())}</p>
            ${join}
            ${remove}
        `;

        liveList.appendChild(card);
    });
}

// ---------- Delete a lesson or live class ----------

async function handleDelete(event) {
    const button = event.target.closest(".delete-btn");
    if (!button || !button.dataset.kind) return;

    if (!confirm("Delete this item?")) return;

    const { data, error } = await db
        .from(button.dataset.kind)
        .delete()
        .eq("id", button.dataset.id)
        .select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this item.");
        return;
    }

    await Promise.all([loadLessons(), loadLive()]);
}

lessonList.addEventListener("click", handleDelete);
liveList.addEventListener("click", handleDelete);

// ---------- Lecturer forms ----------

document.getElementById("lessonForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const link = document.getElementById("lessonUrl").value.trim();

    if (!toEmbedUrl(link)) {
        alert("Please use a YouTube, Vimeo or Google Drive link.");
        return;
    }

    const form = event.target;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;

    const { error } = await db.from("lessons").insert({
        class_id: classId,
        title: document.getElementById("lessonTitle").value.trim(),
        video_url: link
    });

    button.disabled = false;

    if (error) {
        alert("Could not add the lesson: " + error.message);
        return;
    }

    form.reset();
    await loadLessons();
});

document.getElementById("liveForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const link = document.getElementById("liveUrl").value.trim();

    if (!link.startsWith("https://")) {
        alert("The meeting link must start with https://");
        return;
    }

    const start = new Date(document.getElementById("liveStart").value);

    const form = event.target;
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;

    const { error } = await db.from("live_sessions").insert({
        class_id: classId,
        title: document.getElementById("liveTitle").value.trim(),
        starts_at: start.toISOString(),
        join_url: link
    });

    button.disabled = false;

    if (error) {
        alert("Could not schedule the live class: " + error.message);
        return;
    }

    form.reset();
    await loadLive();
});

document.getElementById("deleteClassBtn").addEventListener("click", async function () {
    if (!confirm("Delete this whole class, with all its lessons and live classes?")) return;

    const { data, error } = await db.from("classes").delete().eq("id", classId).select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this class.");
        return;
    }

    window.location.href = "classes.html";
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();