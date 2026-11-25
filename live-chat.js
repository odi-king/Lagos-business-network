// LBN Phase 8B: chat, questions and raised hands inside the live room.
// Works with supabase-live-chat.sql. live-room.js calls LiveChat.start(sessionId, role) after joining.
// Messages live in the database, so the lecturer can delete them or mute a student. The room refreshes every 4 seconds.

window.LiveChat = (function () {
    let sid = null;
    let role = "student";
    let timer = null;
    let busy = false;
    let lastSig = "";
    let handUp = false;

    function el(id) { return document.getElementById(id); }

    function say(text, ok) {
        const m = el("chatMsg");
        if (!m) return;
        m.className = "msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    function button(label, onClick) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-outline";
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    async function moderate(id, action) {
        const { error } = await db.rpc("live_chat_moderate", { p_id: id, p_action: action });
        if (error) say(error.message, false);
        refresh();
    }

    function render(rows) {
        const chats = rows.filter(function (r) { return r.kind !== "hand"; });
        const hands = rows.filter(function (r) { return r.kind === "hand"; });

        const sig = JSON.stringify([role, chats.map(function (r) { return [r.id, r.answered, r.muted]; }), hands.map(function (r) { return r.id; })]);
        if (sig === lastSig) return;
        lastSig = sig;

        const host = role === "host";
        const list = el("chatList");
        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;

        list.textContent = "";

        if (!chats.length) {
            const empty = document.createElement("p");
            empty.className = "meta";
            empty.textContent = "No messages yet. Say hello.";
            list.appendChild(empty);
        }

        chats.forEach(function (r) {
            const row = document.createElement("div");
            row.className = "chat-row" + (r.kind === "question" ? " q" : "");

            const who = document.createElement("span");
            who.className = "who";
            who.textContent = r.name + (r.is_host ? " (lecturer)" : "");
            row.appendChild(who);

            if (r.kind === "question") {
                const tag = document.createElement("span");
                tag.className = "tag";
                tag.textContent = r.answered ? "Question ✓ answered" : "Question";
                row.appendChild(tag);
            }

            const text = document.createElement("span");
            text.textContent = r.body;
            row.appendChild(text);

            if (host || r.mine) {
                const tools = document.createElement("div");
                tools.className = "chat-tools";

                if (host && r.kind === "question") {
                    tools.appendChild(button(r.answered ? "Undo answered" : "Mark answered", function () { moderate(r.id, r.answered ? "unanswered" : "answered"); }));
                }

                if (host && !r.is_host) {
                    tools.appendChild(button(r.muted ? "Unmute " + r.name : "Mute " + r.name, function () { moderate(r.id, r.muted ? "unmute" : "mute"); }));
                }

                if (host) tools.appendChild(button("Delete", function () { moderate(r.id, "delete"); }));

                if (tools.children.length) row.appendChild(tools);
            }

            list.appendChild(row);
        });

        if (nearBottom) list.scrollTop = list.scrollHeight;

        // Raised hands
        const handBox = el("handBox");
        const handList = el("handList");
        handList.textContent = "";

        if (host) {
            handBox.style.display = hands.length ? "" : "none";

            hands.forEach(function (h) {
                const row = document.createElement("div");
                row.className = "chat-row";
                const who = document.createElement("span");
                who.className = "who";
                who.textContent = "✋ " + h.name;
                row.appendChild(who);
                if (window.LiveStage) {
                    row.appendChild(button("Invite up", function () { window.LiveStage.invite(h.user_id, h.name); }));
                }
                row.appendChild(button("Lower hand", function () { moderate(h.id, "delete"); }));
                handList.appendChild(row);
            });
        } else {
            handBox.style.display = "none";
            handUp = hands.some(function (h) { return h.mine; });
            el("handBtn").textContent = handUp ? "Lower hand" : "Raise hand";
        }
    }

    async function refresh() {
        if (!sid || busy) return;
        busy = true;

        try {
            const { data, error } = await db.rpc("live_chat_list", { p_session: sid });

            if (error) {
                say(/live_chat_list|schema cache/i.test(error.message) ? "Chat is not set up yet. Run supabase-live-chat.sql in Supabase." : error.message, false);
                return;
            }

            if (el("chatMsg").className.indexOf("error") !== -1) say("", true);
            render(data || []);
        } finally {
            busy = false;
        }
    }

    async function send(kind, body) {
        const { data, error } = await db.rpc("live_chat_send", { p_session: sid, p_kind: kind, p_body: body });

        if (error) { say(error.message, false); return null; }

        if (data && data.ok === false) { say(data.message || "Could not send", false); return null; }

        say("", true);
        refresh();
        return data;
    }

    function start(sessionId, myRole) {
        if (!sessionId || !el("chatPanel")) return;

        sid = sessionId;
        role = myRole === "host" ? "host" : "student";
        lastSig = "";

        // The lecturer only chats here; questions and hands are for students
        el("handBtn").style.display = role === "host" ? "none" : "";
        el("chatKind").style.display = role === "host" ? "none" : "";

        refresh();
        clearInterval(timer);

        timer = setInterval(function () {
            if (!document.hidden) refresh();
        }, 4000);
    }

    function stop() {
        clearInterval(timer);
        timer = null;
        sid = null;
    }

    document.addEventListener("DOMContentLoaded", function () {
        const form = el("chatForm");
        if (!form) return;

        form.addEventListener("submit", async function (event) {
            event.preventDefault();

            const input = el("chatInput");
            const text = input.value.trim();
            if (!text || !sid) return;

            const kind = role === "host" ? "chat" : el("chatKind").value;
            el("chatSend").disabled = true;

            const result = await send(kind, text);
            if (result) {
                input.value = "";
                if (kind === "question") el("chatKind").value = "chat";
            }

            el("chatSend").disabled = false;
            input.focus();
        });

        el("handBtn").addEventListener("click", async function () {
            if (!sid) return;
            const result = await send("hand", "");
            if (result) el("handBtn").textContent = result.raised ? "Lower hand" : "Raise hand";
        });
    });

    return { start: start, stop: stop, refresh: refresh };
})();