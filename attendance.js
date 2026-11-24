// LBN Phase 7A: proven attendance for live classes.
// The lecturer opens a short code during the class. The student types it. Only then is attendance "verified".
// Works with supabase-attendance.sql. Uses globals from class.js (db, liveList, classId, isOwner, isStudent, escapeHTML).

(function () {
    if (typeof liveList === "undefined" || !liveList || typeof db === "undefined" || !db) return;

    let verified = new Set();
    let loadedMine = false;
    let tries = 0;

    function timeText(value) {
        return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    async function loadMine() {
        if (!isStudent || loadedMine) return;

        const result = await db.rpc("my_live_attendance", { p_class_id: classId });
        loadedMine = true;

        // The database update has not been run yet: stay quiet
        if (result.error) return;

        verified = new Set((result.data || []).filter(function (r) { return r.verified; }).map(function (r) { return r.session_id; }));
    }

    function showCode(box, info) {
        if (!info || !info.code) {
            box.innerHTML = "<p class='meta'>No code is open right now.</p>";
            return;
        }

        box.innerHTML =
            '<p class="meta">Tell your students this code. It works until ' + escapeHTML(timeText(info.expires_at)) + ".</p>" +
            '<p style="font-size:2rem;font-weight:700;letter-spacing:6px;font-family:monospace;margin:6px 0;">' + escapeHTML(info.code) + "</p>";
    }

    async function addOwnerPanel(card, sessionId) {
        const panel = document.createElement("div");
        panel.className = "att-panel";
        panel.style.marginTop = "12px";

        panel.innerHTML =
            '<p class="meta"><strong>Attendance code</strong> (students must type it to count as present)</p>' +
            '<select class="att-minutes" aria-label="How long the code works">' +
            '<option value="15">Works for 15 minutes</option>' +
            '<option value="30" selected>Works for 30 minutes</option>' +
            '<option value="60">Works for 60 minutes</option>' +
            '<option value="120">Works for 2 hours</option>' +
            "</select> " +
            '<button type="button" class="btn btn-outline att-open">Open a new code</button>' +
            '<div class="att-code"></div><p class="msg att-msg"></p>';

        card.appendChild(panel);

        const box = panel.querySelector(".att-code");
        const msg = panel.querySelector(".att-msg");

        const current = await db.rpc("live_code_current", { p_session_id: sessionId });
        if (current.error) {
            panel.innerHTML = "<p class='meta'>Attendance codes are not set up yet. Run supabase-attendance.sql in Supabase.</p>";
            return;
        }
        showCode(box, current.data);

        panel.querySelector(".att-open").addEventListener("click", async function (event) {
            const button = event.currentTarget;
            msg.textContent = "";
            button.disabled = true;

            const result = await db.rpc("live_code_open", {
                p_session_id: sessionId,
                p_minutes: parseInt(panel.querySelector(".att-minutes").value, 10)
            });

            button.disabled = false;

            if (result.error) {
                msg.className = "msg error att-msg";
                msg.textContent = result.error.message;
                return;
            }

            showCode(box, result.data);
        });
    }

    function addStudentPanel(card, sessionId) {
        const panel = document.createElement("div");
        panel.className = "att-panel";
        panel.style.marginTop = "12px";

        if (verified.has(sessionId)) {
            panel.innerHTML = '<p class="msg ok">✓ Your attendance is recorded.</p>';
            card.appendChild(panel);
            return;
        }

        panel.innerHTML =
            '<p class="meta"><strong>Were you in this live class?</strong> Type the code your lecturer gives during the class.</p>' +
            '<input type="text" class="att-input" maxlength="8" placeholder="Code from your lecturer" autocomplete="off" autocapitalize="characters" spellcheck="false"> ' +
            '<button type="button" class="contact-btn att-send">Confirm my attendance</button>' +
            '<p class="msg att-msg"></p>';

        card.appendChild(panel);

        const input = panel.querySelector(".att-input");
        const msg = panel.querySelector(".att-msg");
        const send = panel.querySelector(".att-send");

        send.addEventListener("click", async function () {
            if (input.value.trim().length < 4) {
                msg.className = "msg error att-msg";
                msg.textContent = "Type the code your lecturer gave you.";
                return;
            }

            send.disabled = true;
            msg.className = "msg ok att-msg";
            msg.textContent = "Checking...";

            const result = await db.rpc("live_code_submit", { p_session_id: sessionId, p_code: input.value });

            send.disabled = false;

            if (result.error) {
                msg.className = "msg error att-msg";
                msg.textContent = result.error.message;
                return;
            }

            if (result.data && result.data.ok) {
                verified.add(sessionId);
                panel.innerHTML = '<p class="msg ok">✓ ' + escapeHTML(result.data.message) + "</p>";
                return;
            }

            msg.className = "msg error att-msg";
            msg.textContent = (result.data && result.data.message) || "That code did not work.";
        });
    }

    async function enhance() {
        const cards = Array.from(liveList.querySelectorAll(".business-card[data-session]:not([data-att])"));
        if (cards.length === 0) return;

        // class.js decides who is the owner and who is a student a moment after the page opens
        if (!isOwner && !isStudent) return;

        await loadMine();

        cards.forEach(function (card) {
            if (card.dataset.att) return;
            card.dataset.att = "1";

            const sessionId = card.dataset.session;
            const start = new Date(card.dataset.start).getTime();

            if (isOwner) {
                addOwnerPanel(card, sessionId);
            } else if (isStudent && Date.now() < start + 9 * 60 * 60 * 1000) {
                addStudentPanel(card, sessionId);
            }
        });
    }

    // Cards are drawn by class.js; add the panels whenever the list is drawn again
    new MutationObserver(function () { enhance(); }).observe(liveList, { childList: true });

    // The role may not be known yet on the very first draw: try again for a few seconds
    const timer = setInterval(function () {
        tries++;
        enhance();
        if (tries > 20) clearInterval(timer);
    }, 1000);
})();