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
        const direct = !!lesson.video_path;
        const embed = direct ? null : toEmbedUrl(lesson.video_url);
        const card = document.createElement("div");
        card.className = "business-card";

        const extension = direct ? (lesson.video_path.split(".").pop() || "mp4") : "";
        const downloadName = (String(lesson.title).replace(/[^\w\- ]+/g, "").trim() || "lesson") + "." + extension;

        const watch = direct
            ? '<button type="button" class="contact-btn watch-btn" data-path="' + escapeHTML(lesson.video_path) + '" data-id="' + escapeHTML(lesson.id) + '">Watch</button>'
            : embed
                ? '<button type="button" class="contact-btn watch-btn" data-embed="' + escapeHTML(embed) + '">Watch</button>'
                : '<a class="contact-btn" target="_blank" rel="noopener" href="' + escapeHTML(lesson.video_url) + '">Open video</a>';

        const download = direct && lesson.downloadable !== false
            ? '<button type="button" class="btn btn-outline download-lesson" data-path="' + escapeHTML(lesson.video_path) +
              '" data-name="' + escapeHTML(downloadName) + '">Download' + (lesson.file_size ? " (" + Math.max(1, Math.round(lesson.file_size / 1048576)) + " MB)" : "") + "</button>"
            : "";

        const remove = isOwner
            ? '<button type="button" class="delete-btn" data-kind="lessons" data-id="' + escapeHTML(lesson.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${index + 1}. ${escapeHTML(lesson.title)}</h3>
            <div class="video-slot"></div>
            ${watch}
            ${download}
            ${completeButton(lesson)}
            ${remove}
        `;

        lessonList.appendChild(card);
    });
}

lessonList.addEventListener("click", async function (event) {
    const button = event.target.closest(".watch-btn");
    if (!button) return;

    const slot = button.parentElement.querySelector(".video-slot");

    if (slot.firstChild) {
        slot.innerHTML = "";
        button.textContent = "Watch";
        return;
    }

    // An uploaded video plays right here on LBN
    if (button.dataset.path) {
        button.disabled = true;
        button.textContent = "Loading...";

        const signed = await db.storage.from("lesson-videos").createSignedUrl(button.dataset.path, 3600);

        button.disabled = false;

        if (signed.error || !signed.data) {
            button.textContent = "Watch";
            alert("Could not open this video. Please try again.");
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "video-direct";

        const video = document.createElement("video");
        video.src = signed.data.signedUrl;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";

        // Carry on from where the student stopped
        const key = "lbn_pos_" + button.dataset.id;
        let lastSaved = 0;

        video.addEventListener("loadedmetadata", function () {
            const saved = parseFloat(localStorage.getItem(key));
            if (saved > 5 && saved < video.duration - 5) video.currentTime = saved;
        });

        video.addEventListener("timeupdate", function () {
            if (video.currentTime - lastSaved > 5 || video.currentTime < lastSaved) {
                lastSaved = video.currentTime;
                localStorage.setItem(key, String(Math.floor(video.currentTime)));
            }
        });

        video.addEventListener("ended", function () {
            localStorage.removeItem(key);
        });

        wrap.appendChild(video);
        slot.appendChild(wrap);
        button.textContent = "Close video";
        return;
    }

    // Older lessons that were added as links still play from their link
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

// Save the lesson to the phone or computer for offline viewing
lessonList.addEventListener("click", async function (event) {
    const button = event.target.closest(".download-lesson");
    if (!button) return;

    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing...";

    const signed = await db.storage.from("lesson-videos").createSignedUrl(button.dataset.path, 3600, {
        download: button.dataset.name || true
    });

    button.disabled = false;
    button.textContent = original;

    if (signed.error || !signed.data) {
        alert("Could not prepare the download. Please try again.");
        return;
    }

    window.location.href = signed.data.signedUrl;
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

    // An uploaded video is removed from storage too
    if (button.dataset.kind === "lessons" && data[0].video_path) {
        await db.storage.from("lesson-videos").remove([data[0].video_path]);
    }

    await Promise.all([loadLessons(), loadLive()]);
}

lessonList.addEventListener("click", handleDelete);
liveList.addEventListener("click", handleDelete);

// ---------- Lecturer forms ----------

// ---------- Uploading a video lesson from the phone or computer ----------

const LESSON_MAX_MB = 50; // the free Supabase plan allows 50 MB per file; raise this after upgrading
document.getElementById("maxMb").textContent = LESSON_MAX_MB;

function uniqueName() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Sends the file straight to storage and reports how far it has got
async function uploadWithProgress(path, file, onProgress) {
    const { data } = await db.auth.getSession();
    const token = data.session ? data.session.access_token : "";

    return new Promise(function (resolve, reject) {
        const xhr = new XMLHttpRequest();

        xhr.open("POST", SUPABASE_URL.trim().replace(/\/$/, "") + "/storage/v1/object/lesson-videos/" +
            path.split("/").map(encodeURIComponent).join("/"));
        xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.setRequestHeader("apikey", SUPABASE_KEY.trim());
        xhr.setRequestHeader("x-upsert", "false");

        xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) onProgress(e.loaded / e.total);
        };

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
                return;
            }

            let message = "The upload failed.";

            try { message = JSON.parse(xhr.responseText).message || message; } catch (e) {}

            if (/size|exceed|too large/i.test(message) || xhr.status === 413) {
                message = "This video is bigger than your storage allows. Pick a shorter or smaller video, or upgrade Supabase for bigger files.";
            }

            reject(new Error(message));
        };

        xhr.onerror = function () {
            reject(new Error("The upload was interrupted. Check your internet and try again."));
        };

        const form = new FormData();
        form.append("cacheControl", "3600");
        form.append("", file);
        xhr.send(form);
    });
}

document.getElementById("lessonForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = event.target;
    const file = document.getElementById("lessonFile").files[0];
    const title = document.getElementById("lessonTitle").value.trim();

    if (!file) {
        alert("Choose a video from your phone or computer first.");
        return;
    }

    if (!file.type.startsWith("video/")) {
        alert("Please choose a video file.");
        return;
    }

    if (file.size > LESSON_MAX_MB * 1024 * 1024) {
        alert("This video is " + Math.round(file.size / 1048576) + " MB. The limit is " + LESSON_MAX_MB + " MB. Choose a shorter video or compress it first.");
        return;
    }

    const extension = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const path = currentUser.id + "/" + classId + "/" + uniqueName() + "." + extension;

    const button = document.getElementById("uploadBtn");
    const progress = document.getElementById("uploadProgress");
    const bar = document.getElementById("upBar");
    const text = document.getElementById("upText");

    button.disabled = true;
    progress.style.display = "block";
    bar.style.width = "0%";
    text.textContent = "Uploading... 0%";

    try {
        await uploadWithProgress(path, file, function (fraction) {
            const percent = Math.round(fraction * 100);
            bar.style.width = percent + "%";
            text.textContent = "Uploading... " + percent + "%";
        });
    } catch (error) {
        button.disabled = false;
        progress.style.display = "none";
        alert(error.message);
        return;
    }

    text.textContent = "Saving the lesson...";

    const { error } = await db.from("lessons").insert({
        class_id: classId,
        title: title,
        video_path: path,
        file_name: file.name,
        file_size: file.size,
        downloadable: document.getElementById("lessonDownload").checked
    });

    button.disabled = false;
    progress.style.display = "none";

    if (error) {
        await db.storage.from("lesson-videos").remove([path]);
        alert("Could not add the lesson: " + error.message);
        return;
    }

    form.reset();
    document.getElementById("lessonDownload").checked = true;
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

    const lessonFiles = await db.from("lessons").select("video_path").eq("class_id", classId);

    const { data, error } = await db.from("classes").delete().eq("id", classId).select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this class.");
        return;
    }

    const paths = ((lessonFiles && lessonFiles.data) || []).map(function (r) { return r.video_path; }).filter(Boolean);
    if (paths.length > 0) await db.storage.from("lesson-videos").remove(paths);

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