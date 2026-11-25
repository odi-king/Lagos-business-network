// LBN Phase 8E: students rate and comment on live classes.
// Works with supabase-ratings.sql. Uses globals from class.js (db, liveList, classId, isOwner, isStudent, escapeHTML).
// Students who joined a class can give 1 to 5 stars and a short comment. The lecturer sees the comments (without names).

(function () {
    if (typeof liveList === "undefined" || !liveList || typeof db === "undefined" || !db) return;

    let summary = null;
    let mine = null;
    let tries = 0;
    let unavailable = false;

    const LABELS = ["", "1 star - Poor", "2 stars - Fair", "3 stars - Good", "4 stars - Very good", "5 stars - Excellent"];

    function starsText(n) {
        return "★".repeat(n) + "☆".repeat(5 - n);
    }

    async function load() {
        const result = await db.rpc("class_live_ratings", { p_class: classId });

        if (result.error) { unavailable = true; return false; }

        summary = new Map((result.data || []).map(function (r) { return [r.session_id, r]; }));

        if (isStudent) {
            const m = await db.rpc("my_live_ratings", { p_class: classId });
            mine = new Map(((m.data) || []).map(function (r) { return [r.session_id, r]; }));
        }

        return true;
    }

    function addSummary(card, sessionId) {
        const info = summary.get(sessionId);
        const line = document.createElement("p");
        line.className = "meta";

        if (info && info.average !== null && info.average !== undefined) {
            line.textContent = "Rating: " + Number(info.average).toFixed(1) + " / 5 " + starsText(Math.round(Number(info.average))) + " (" + info.ratings + (info.ratings === 1 ? " rating)" : " ratings)");
        } else if (isOwner) {
            line.textContent = "No ratings yet.";
        } else {
            return;
        }

        card.appendChild(line);
    }

    function addOwnerComments(card, sessionId) {
        const info = summary.get(sessionId);
        const comments = (info && info.comments) || [];
        if (!comments.length) return;

        const box = document.createElement("details");
        box.className = "faq";
        const head = document.createElement("summary");
        head.textContent = "Student comments (" + comments.length + ")";
        box.appendChild(head);

        comments.forEach(function (c) {
            const row = document.createElement("div");
            row.className = "comment";
            row.textContent = starsText(c.stars) + "  " + c.comment;
            box.appendChild(row);
        });

        card.appendChild(box);
    }

    function addStudentForm(card, sessionId) {
        const existing = mine && mine.get(sessionId);
        const box = document.createElement("div");
        box.style.marginTop = "12px";

        const title = document.createElement("p");
        title.className = "meta";
        title.innerHTML = "<strong>Did you join this class? Rate it.</strong>";
        box.appendChild(title);

        const select = document.createElement("select");
        select.setAttribute("aria-label", "Your rating");
        [5, 4, 3, 2, 1].forEach(function (n) {
            const o = document.createElement("option");
            o.value = String(n);
            o.textContent = LABELS[n];
            select.appendChild(o);
        });
        select.value = existing ? String(existing.stars) : "5";
        box.appendChild(select);

        const text = document.createElement("textarea");
        text.maxLength = 300;
        text.placeholder = "A short comment (optional). Only your lecturer sees it, without your name.";
        text.value = existing ? existing.comment : "";
        box.appendChild(text);

        const send = document.createElement("button");
        send.type = "button";
        send.className = "contact-btn";
        send.textContent = existing ? "Update my rating" : "Send my rating";
        box.appendChild(send);

        const msg = document.createElement("p");
        msg.className = "msg";
        box.appendChild(msg);

        send.addEventListener("click", async function () {
            send.disabled = true;
            msg.className = "msg ok";
            msg.textContent = "Saving...";

            const result = await db.rpc("rate_live_session", {
                p_session: sessionId,
                p_stars: parseInt(select.value, 10),
                p_comment: text.value
            });

            send.disabled = false;

            if (result.error || !result.data || result.data.ok === false) {
                msg.className = "msg error";
                msg.textContent = result.error ? result.error.message : (result.data && result.data.message) || "Could not save your rating";
                return;
            }

            msg.className = "msg ok";
            msg.textContent = "Thank you. Your rating is saved.";
            send.textContent = "Update my rating";
        });

        card.appendChild(box);
    }

    async function enhance() {
        if (unavailable) return;

        const cards = Array.from(liveList.querySelectorAll(".business-card[data-session]:not([data-rt])"));
        if (!cards.length) return;

        // class.js decides who is the owner and who is a student a moment after the page opens
        if (!isOwner && !isStudent) return;

        if (!summary && !(await load())) return;

        cards.forEach(function (card) {
            if (card.dataset.rt) return;
            card.dataset.rt = "1";

            const sessionId = card.dataset.session;
            const started = new Date(card.dataset.start).getTime() < Date.now();

            if (!started) return;

            addSummary(card, sessionId);
            if (isOwner) addOwnerComments(card, sessionId);
            if (isStudent) addStudentForm(card, sessionId);
        });
    }

    new MutationObserver(function () { enhance(); }).observe(liveList, { childList: true });

    const timer = setInterval(function () {
        tries++;
        enhance();
        if (tries > 20) clearInterval(timer);
    }, 1000);
})();