// LBN Phase 8D: attendance inside the live room.
// Works with supabase-presence.sql and supabase-attendance.sql. live-room.js calls LiveAttendance.start() after joining.
// Students: time in the room is counted automatically; they also type the lecturer's code here.
// Lecturer: opens the code here and sees who is in the room.

window.LiveAttendance = (function () {
    let sid = null;
    let role = "student";
    let pingTimer = null;
    let listTimer = null;
    let verified = false;

    function el(id) { return document.getElementById(id); }

    function say(text, ok) {
        const m = el("attMsg");
        if (!m) return;
        m.className = "msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    function timeText(value) {
        return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    // ---------- Student ----------

    function showStatus(s) {
        if (!s || s.host) return;

        const needed = Number(s.needed) || 0;
        const minutes = Number(s.minutes) || 0;
        verified = s.code_verified === true;

        let text = "In the room: " + minutes + (needed ? " of " + needed : "") + " minutes. ";
        text += verified ? "✓ Code typed. " : "Type the code from your lecturer below. ";
        if (s.counts) text += "✓ This class counts as a lecture.";
        else if (verified && minutes < needed) text += "Stay in the room a little longer to count it.";

        el("attStatus").textContent = text;
        el("attCodeForm").style.display = verified ? "none" : "";
    }

    async function ping() {
        if (!sid) return;
        const { data, error } = await db.rpc("live_presence_ping", { p_session: sid });

        if (error) {
            say(/live_presence_ping|schema cache/i.test(error.message) ? "Attendance is not set up yet. Run supabase-presence.sql in Supabase." : error.message, false);
            return;
        }

        showStatus(data);
    }

    async function submitCode() {
        const input = el("attCode");
        const code = input.value.trim();

        if (code.length < 4) { say("Type the code your lecturer gave you.", false); return; }

        el("attSend").disabled = true;
        const { data, error } = await db.rpc("live_code_submit", { p_session_id: sid, p_code: code });
        el("attSend").disabled = false;

        if (error) { say(error.message, false); return; }

        if (data && data.ok) {
            say(data.message || "Your attendance is recorded.", true);
            input.value = "";
            ping();
        } else {
            say((data && data.message) || "That code did not work.", false);
        }
    }

    // ---------- Lecturer ----------

    function showCode(info) {
        const box = el("attCurrent");

        if (!info || !info.code) {
            box.textContent = "No code is open right now.";
            return;
        }

        box.textContent = "";
        const note = document.createElement("p");
        note.className = "meta";
        note.textContent = "Tell your students this code. It works until " + timeText(info.expires_at) + ".";

        const big = document.createElement("p");
        big.style.cssText = "font-size:2rem;font-weight:700;letter-spacing:6px;font-family:monospace;margin:6px 0;";
        big.textContent = info.code;

        box.appendChild(note);
        box.appendChild(big);
    }

    async function loadCode() {
        const { data, error } = await db.rpc("live_code_current", { p_session_id: sid });
        if (error) { say("Attendance codes are not set up yet. Run supabase-attendance.sql in Supabase.", false); return; }
        showCode(data);
    }

    async function openCode() {
        el("attOpen").disabled = true;
        const { data, error } = await db.rpc("live_code_open", {
            p_session_id: sid,
            p_minutes: parseInt(el("attMinutes").value, 10)
        });
        el("attOpen").disabled = false;

        if (error) { say(error.message, false); return; }
        say("", true);
        showCode(data);
    }

    async function loadPeople() {
        if (!sid) return;
        const { data, error } = await db.rpc("live_presence_list", { p_session: sid });
        const box = el("attPeople");

        if (error) {
            box.textContent = /live_presence_list|schema cache/i.test(error.message) ? "Run supabase-presence.sql in Supabase to see who is in the room." : error.message;
            return;
        }

        box.textContent = "";

        if (!data || !data.length) {
            const none = document.createElement("p");
            none.className = "meta";
            none.textContent = "No students have been counted yet.";
            box.appendChild(none);
            return;
        }

        data.forEach(function (p) {
            const row = document.createElement("div");
            row.className = "chat-row";
            row.textContent = p.name + ": " + p.minutes + " min" + (p.code_verified ? ", code typed" : ", no code yet") + (p.counts ? " ✓ counts" : "");
            box.appendChild(row);
        });
    }

    function start(sessionId, myRole) {
        if (!sessionId || !el("attPanel")) return;

        sid = sessionId;
        role = myRole === "host" ? "host" : "student";
        el("attPanel").style.display = "";
        el("attStudent").style.display = role === "host" ? "none" : "";
        el("attHost").style.display = role === "host" ? "" : "none";
        say("", true);

        if (role === "host") {
            loadCode();
            loadPeople();
            listTimer = setInterval(function () { if (!document.hidden) loadPeople(); }, 15000);
        } else {
            ping();
            pingTimer = setInterval(ping, 30000);
        }
    }

    function stop() {
        clearInterval(pingTimer);
        clearInterval(listTimer);
        pingTimer = null;
        listTimer = null;
        sid = null;
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!el("attPanel")) return;
        el("attSend").addEventListener("click", submitCode);
        el("attCode").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitCode(); } });
        el("attOpen").addEventListener("click", openCode);
    });

    return { start: start, stop: stop };
})();