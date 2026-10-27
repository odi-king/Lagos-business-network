const classId = new URLSearchParams(window.location.search).get("id");

let currentUser = null;
let currentClass = null;
let isOwner = false;
let isStudent = false;
let completedLessons = new Set();

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
        .select("*, profiles(full_name, institution, role, approved, verified, is_admin)")
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
        badgeHTML(currentClass.profiles) +
        (institution ? "<br>" + escapeHTML(institution) : "");
    document.getElementById("classDesc").textContent = currentClass.description || "";

    if (isOwner) {
        document.getElementById("ownerPanel").style.display = "block";
    }

    // Students can tick off lessons they have finished
    const mine = await db.from("profiles").select("role").eq("id", currentUser.id).maybeSingle();
    isStudent = !!(mine.data && mine.data.role === "student");
    if (isStudent) await loadMyProgress();

    await Promise.all([loadLessons(), loadLive()]);

    if (isOwner) loadAssessmentPanel();

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
            ${completeButton(lesson)}
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
            : '<a class="contact-btn join-live" data-session="' + escapeHTML(session.id) + '" target="_blank" rel="noopener" href="' + escapeHTML(session.join_url) + '">Join live class</a>';

        const remove = isOwner
            ? '<button type="button" class="delete-btn" data-kind="live_sessions" data-id="' + escapeHTML(session.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(session.title)}</h3>
            <p class="meta">${escapeHTML(start.toLocaleString())}</p>
            ${join}
            ${remove}
        `;

        if (isOwner) {
            const who = document.createElement("button");
            who.type = "button";
            who.className = "btn btn-outline attendees-btn";
            who.textContent = "Who joined";
            who.dataset.session = session.id;
            who.style.margin = "10px 8px 0 0";
            card.appendChild(who);

            const box = document.createElement("div");
            box.className = "attendees-box";
            card.appendChild(box);
        }

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

// ---------- Students: mark lessons as complete ----------

async function loadMyProgress() {
    const { data } = await db.rpc("my_lesson_progress", { p_class_id: classId });
    completedLessons = new Set((data || []).map(function (row) { return row.lesson_id; }));
}

function completeButton(lesson) {
    if (!isStudent) return "";

    const done = completedLessons.has(lesson.id);

    return '<button type="button" class="btn ' + (done ? "done-btn" : "btn-outline") + ' complete-btn" data-lesson="' +
        escapeHTML(lesson.id) + '">' + (done ? "\u2713 Completed" : "Mark as complete") + "</button>";
}

lessonList.addEventListener("click", async function (event) {
    const button = event.target.closest(".complete-btn");
    if (!button) return;

    const id = button.dataset.lesson;
    const makeDone = !completedLessons.has(id);

    button.disabled = true;

    const { error } = await db.rpc("mark_lesson_complete", { p_lesson_id: id, p_done: makeDone });

    button.disabled = false;

    if (error) {
        alert(error.message);
        return;
    }

    if (makeDone) completedLessons.add(id); else completedLessons.delete(id);

    button.className = "btn " + (makeDone ? "done-btn" : "btn-outline") + " complete-btn";
    button.textContent = makeDone ? "\u2713 Completed" : "Mark as complete";
});

// ---------- Lecturers: record who met the standard ----------

async function loadAssessmentPanel() {
    const list = document.getElementById("studentProgressList");
    const select = document.getElementById("assessStudent");
    const log = document.getElementById("assessLog");

    const students = await db.rpc("class_students", { p_class_id: classId });

    if (students.error) {
        list.innerHTML = "<p class='meta'>" + escapeHTML(students.error.message) + "</p>";
        return;
    }

    select.innerHTML = '<option value="" disabled selected>Choose a student</option>';

    if (students.data.length === 0) {
        list.innerHTML = "<p class='meta'>No students have completed a lesson yet.</p>";
    } else {
        list.innerHTML = "";

        students.data.forEach(function (s) {
            const row = document.createElement("p");
            row.className = "meta";
            row.textContent = (s.full_name || "Student") + ": " + s.lessons_done + " of " + s.total_lessons +
                " lessons done, " + s.passed_here + " passed here";
            list.appendChild(row);

            const option = document.createElement("option");
            option.value = s.student_id;
            option.textContent = s.full_name || "Student";
            select.appendChild(option);
        });
    }

    const entries = await db.rpc("class_assessment_log", { p_class_id: classId });

    if (entries.error || entries.data.length === 0) {
        log.innerHTML = "<p class='meta'>Nothing recorded yet.</p>";
        return;
    }

    log.innerHTML = "";

    entries.data.forEach(function (a) {
        const row = document.createElement("div");
        row.className = "comment";
        row.innerHTML =
            "<strong>" + escapeHTML(a.student_name || "Student") + "</strong>: " + escapeHTML(a.title) + " \u2022 " +
            (a.result === "passed" ? "Passed" : "Not yet") +
            (a.note ? " \u2022 " + escapeHTML(a.note) : "") +
            ' <span class="meta">' + new Date(a.created_at).toLocaleDateString() + "</span>";
        log.appendChild(row);
    });
}

document.getElementById("assessForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const message = document.getElementById("assessMsg");
    message.className = "msg ok";
    message.textContent = "Saving...";

    const { error } = await db.rpc("record_assessment", {
        p_class_id: classId,
        p_student_id: document.getElementById("assessStudent").value,
        p_title: document.getElementById("assessTitle").value,
        p_result: document.getElementById("assessResult").value,
        p_note: document.getElementById("assessNote").value
    });

    if (error) {
        message.className = "msg error";
        message.textContent = error.message;
        return;
    }

    message.textContent = "Saved.";
    document.getElementById("assessTitle").value = "";
    document.getElementById("assessNote").value = "";
    await loadAssessmentPanel();
});

// ---------- Live classes: attendance ----------

liveList.addEventListener("click", async function (event) {
    const join = event.target.closest(".join-live");

    if (join) {
        // The link opens as usual. This only writes down that the person joined.
        db.rpc("join_live_session", { p_session_id: join.dataset.session });
        return;
    }

    const who = event.target.closest(".attendees-btn");
    if (!who) return;

    const box = who.parentElement.querySelector(".attendees-box");
    const { data, error } = await db.rpc("live_attendees", { p_session_id: who.dataset.session });

    if (error) {
        box.textContent = error.message;
        return;
    }

    box.innerHTML = data.length === 0
        ? "<p class='meta'>Nobody has joined yet.</p>"
        : "<p class='meta'>" + data.length + " joined:</p>" + data.map(function (a) {
            return "<div class='comment'>" + escapeHTML(a.full_name || "Member") + " <span class='meta'>" +
                new Date(a.joined_at).toLocaleTimeString() + "</span></div>";
        }).join("");
});

init();