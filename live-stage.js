// LBN Phase 8C: invite a student on stage.
// Works with supabase-stage.sql and the livekit-stage function. live-room.js calls LiveStage.start() after joining.
// The lecturer taps "Invite up" next to a raised hand. The student accepts, and the microphone (and camera) can reach the class.

window.LiveStage = (function () {
    let sid = null;
    let role = "student";
    let timer = null;
    let busy = false;
    let wasOnstage = false;
    let lastSig = "";

    function el(id) { return document.getElementById(id); }

    function say(text, ok) {
        const m = el("stageMsg");
        if (!m) return;
        m.className = "msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    function button(label, onClick, primary) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = primary ? "contact-btn" : "btn btn-outline";
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    async function reason(error) {
        try {
            const res = error && error.context;
            if (res && typeof res.text === "function") {
                const raw = await res.text();
                try { const body = JSON.parse(raw); return body.error || body.message || raw; } catch (e) { return raw; }
            }
        } catch (e) { /* fall through */ }
        return (error && error.message) || "Something went wrong";
    }

    // Ask the livekit-stage function (it may have been saved under a name ending in -ts)
    async function callStage(action, userId) {
        const body = { session_id: sid, action: action, user_id: userId || null };
        let r = await db.functions.invoke("livekit-stage", { body: body });

        if (r.error && r.error.context && r.error.context.status === 404) {
            r = await db.functions.invoke("livekit-stage-ts", { body: body });
        }

        if (r.error) return { ok: false, message: await reason(r.error) };
        if (!r.data || r.data.ok === false) return { ok: false, message: (r.data && r.data.error) || "Not allowed" };
        return { ok: true };
    }

    function render(s) {
        const guests = s.onstage || [];
        const sig = JSON.stringify([role, s.mine, guests.map(function (g) { return g.user_id; })]);
        if (sig === lastSig) return;
        lastSig = sig;

        const panel = el("stagePanel");
        const invite = el("stageInvite");
        const list = el("stageList");
        list.textContent = "";

        invite.style.display = role !== "host" && s.mine === "invited" ? "" : "none";

        guests.forEach(function (g) {
            const row = document.createElement("div");
            row.className = "chat-row";

            const who = document.createElement("span");
            who.className = "who";
            who.textContent = "🎤 " + g.name + (g.mine ? " (you)" : "") + " is on stage";
            row.appendChild(who);

            if (role === "host") {
                row.appendChild(button("Send back", async function () {
                    const r = await callStage("revoke", g.user_id);
                    say(r.ok ? "" : r.message, r.ok);
                    refresh();
                }));
            } else if (g.mine) {
                row.appendChild(button("Leave the stage", async function () {
                    const r = await callStage("revoke", null);
                    say(r.ok ? "" : r.message, r.ok);
                    if (r.ok && window.LiveRoom) window.LiveRoom.becomeViewer();
                    wasOnstage = false;
                    refresh();
                }));
            }

            list.appendChild(row);
        });

        panel.style.display = (guests.length || invite.style.display === "") ? "" : "none";
    }

    async function refresh() {
        if (!sid || busy) return;
        busy = true;

        try {
            const { data, error } = await db.rpc("live_stage_status", { p_session: sid });
            if (error || !data) return;

            // Taken off stage by the lecturer: go back to being a viewer
            if (data.mine !== "onstage" && wasOnstage) {
                wasOnstage = false;
                if (window.LiveRoom) await window.LiveRoom.becomeViewer();
                say("You are back in the audience.", true);
            }

            // Put on stage while we did not know (for example from another tab)
            if (data.mine === "onstage" && !wasOnstage && role !== "host") {
                wasOnstage = true;
                if (window.LiveRoom) await window.LiveRoom.becomeGuest(false);
            }

            render(data);
        } finally {
            busy = false;
        }
    }

    async function invite(userId, name) {
        const { data, error } = await db.rpc("live_stage_invite", { p_session: sid, p_user: userId });

        if (error) { say(error.message, false); return; }
        if (data && data.ok === false) { say(data.message || "Could not invite", false); return; }

        say("Invitation sent to " + name + ". They will see it in a few seconds.", true);
        if (window.LiveChat) window.LiveChat.refresh();
        refresh();
    }

    function start(sessionId, myRole, alreadyOnstage) {
        if (!sessionId || !el("stagePanel")) return;

        sid = sessionId;
        role = myRole === "host" ? "host" : "student";
        wasOnstage = alreadyOnstage === true;
        lastSig = "";

        refresh();
        clearInterval(timer);
        timer = setInterval(function () { if (!document.hidden) refresh(); }, 4000);
    }

    function stop() {
        clearInterval(timer);
        timer = null;
        sid = null;
    }

    document.addEventListener("DOMContentLoaded", function () {
        const accept = el("stageAccept");
        if (!accept) return;

        accept.addEventListener("click", async function () {
            accept.disabled = true;
            say("Taking you on stage...", true);

            const r = await callStage("grant", null);

            if (!r.ok) {
                say(r.message, false);
                accept.disabled = false;
                refresh();
                return;
            }

            wasOnstage = true;
            lastSig = "";
            say("You are on stage. The whole class can hear you.", true);
            if (window.LiveRoom) await window.LiveRoom.becomeGuest(true);
            accept.disabled = false;
            refresh();
        });

        el("stageDecline").addEventListener("click", async function () {
            await db.rpc("live_stage_decline", { p_session: sid });
            lastSig = "";
            say("", true);
            refresh();
        });
    });

    return { start: start, stop: stop, invite: invite };
})();