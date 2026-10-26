const liveList = document.getElementById("liveList");
const liveNote = document.getElementById("liveNote");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function whenText(start) {
    const minutes = Math.round((start.getTime() - Date.now()) / 60000);

    if (minutes <= 0) return "Live now or just started";
    if (minutes < 60) return "Starts in " + minutes + " minutes";

    const hours = Math.round(minutes / 60);
    if (hours < 24) return "Starts in " + hours + (hours === 1 ? " hour" : " hours");

    const days = Math.round(hours / 24);
    return "Starts in " + days + (days === 1 ? " day" : " days");
}

async function init() {
    if (!db) {
        liveNote.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("live.html");
        return;
    }

    if (!(await hasActiveMembership(data.session.user.id))) {
        window.location.href = "pay.html";
        return;
    }

    const result = await db.rpc("upcoming_live_sessions");

    if (result.error) {
        liveNote.textContent = "Could not load live classes. " + result.error.message;
        return;
    }

    if (result.data.length === 0) {
        liveNote.textContent = "No live classes are scheduled yet. Lecturers add them inside their classes.";
        return;
    }

    result.data.forEach(function (s) {
        const start = new Date(s.starts_at);
        const card = document.createElement("div");
        card.className = "business-card live-card";

        card.innerHTML = `
            <p class="live-when">${escapeHTML(whenText(start))}</p>
            <h3>${escapeHTML(s.title)}</h3>
            <p class="meta">${escapeHTML(start.toLocaleString())}</p>
            <p class="meta">${escapeHTML(s.class_title)} &bull; ${escapeHTML(s.field)} &bull; ${escapeHTML(s.lecturer_name || "Lecturer")}</p>
            <a class="contact-btn" target="_blank" rel="noopener" href="${escapeHTML(s.join_url)}">Join live class</a>
            <a class="btn btn-outline" style="margin:10px 8px 0 0;" href="class.html?id=${encodeURIComponent(s.class_id)}">Open class</a>
        `;

        liveList.appendChild(card);
    });
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init(); 