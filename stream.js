// LBN Phase 10A: a social live stream (watch or host). Works with supabase-streams.sql and the livekit-token-ts function.
// The member who started the stream is the host (camera, microphone, screen). Everybody else watches, chats and reacts.

(function () {
    function el(id) { return document.getElementById(id); }

    const msg = el("roomMsg");
    const stage = el("stage");

    let sid = "";
    let room = null;
    let pass = null;
    let saveData = false;
    let micOn = false;
    let camOn = false;
    let sharing = false;
    let beatTimer = null;
    let chatTimer = null;
    let chatBusy = false;
    let lastSig = "";
    let viewers = 0;
    let ended = false;
    let stageTimer = null;
    let stageBusy = false;
    let wasOnstage = false;
    let stageSig = "";
    let handUp = false;
    let giftTimer = null;
    let giftBusy = false;
    let giftCursor = null;
    let giftBalance = 0;

    function say(text, ok) {
        msg.className = "msg " + (ok ? "ok" : "error");
        msg.textContent = text;
    }

    function updateStatus() {
        if (!room) return;
        let text = viewers + (viewers === 1 ? " person is watching." : " people are watching.");
        if (pass.role === "viewer" && !stage.querySelector("video") && !document.querySelector("audio[data-lbn]")) text += " Waiting for the streamer...";
        el("roomStatus").textContent = text;
    }

    async function errorText(error) {
        try {
            const res = error && error.context;

            if (res && typeof res.text === "function") {
                const raw = await res.text();
                let reason = raw;

                try {
                    const body = JSON.parse(raw);
                    reason = body.error || body.message || body.msg || raw;
                } catch (e) { /* not JSON: keep the text */ }

                return String(reason || "No details").slice(0, 200);
            }
        } catch (e) { /* fall through */ }

        return (error && error.message) || "Something went wrong. Please try again.";
    }

    async function init() {
        if (!db || typeof LivekitClient === "undefined") {
            say("The live stream could not load. Please check your internet and refresh.", false);
            return;
        }

        sid = (new URLSearchParams(location.search).get("s") || "").trim();

        if (!sid) { location.href = "streams.html"; return; }

        const { data } = await db.auth.getSession();

        if (!data.session) {
            location.href = "auth.html?next=" + encodeURIComponent("stream.html?s=" + sid);
            return;
        }

        const result = await db.functions.invoke("livekit-token-ts", { body: { stream_id: sid } });

        if (result.error || !result.data || !result.data.token) {
            say(await errorText(result.error || { message: (result.data && result.data.error) || "" }), false);
            return;
        }

        pass = result.data;

        el("roomTitle").textContent = pass.title || "Live stream";
        el("roomJoinText").textContent = pass.role === "host"
            ? "You are the streamer. When you join, your camera and microphone start. Tap Join to go live."
            : "You will watch and listen. If your data is limited, turn the video off after you join: you keep the sound.";
        el("roomJoinBox").style.display = "";
    }

    function attach(track, publication) {
        if (track.kind === "video") {
            const v = track.attach();
            v.playsInline = true;
            v.setAttribute("playsinline", "");
            if (publication && publication.source === LivekitClient.Track.Source.ScreenShare) v.className = "screen";
            v.dataset.sid = track.sid;
            stage.appendChild(v);
        } else if (track.kind === "audio") {
            const a = track.attach();
            a.dataset.lbn = "1";
            a.dataset.sid = track.sid;
            document.body.appendChild(a);
        }

        updateStatus();
    }

    function detach(track) {
        track.detach().forEach(function (e) { e.remove(); });
        updateStatus();
    }

    function setButtons() {
        el("micBtn").textContent = "Microphone: " + (micOn ? "on" : "off");
        el("camBtn").textContent = "Camera: " + (camOn ? "on" : "off");
        el("screenBtn").textContent = sharing ? "Stop sharing" : "Share screen";
    }

    function applySaveData() {
        if (!room) return;

        room.remoteParticipants.forEach(function (p) {
            p.trackPublications.forEach(function (pub) {
                if (pub.kind === "video") pub.setSubscribed(!saveData);
            });
        });
    }

    // ---------- Heartbeat: viewer count and "has the stream ended?" ----------

    async function beat() {
        if (!sid || ended) return;

        const { data } = await db.rpc("stream_beat", { p_stream: sid });
        if (!data) return;

        if (data.live === false) {
            finish(data.by_admin ? "The LBN team ended this stream." : "This stream has ended.");
            return;
        }

        viewers = data.viewers || 0;
        updateStatus();
    }

    function finish(text) {
        ended = true;
        clearInterval(beatTimer);
        clearInterval(chatTimer);
        clearInterval(stageTimer);
        clearInterval(giftTimer);
        if (room) { try { room.disconnect(); } catch (e) { /* already closed */ } }
        el("roomLive").style.display = "none";
        say(text + " See more on the Live streams page.", true);
    }

    // ---------- Chat and reactions ----------

    function button(label, fn) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-outline";
        b.textContent = label;
        b.addEventListener("click", fn);
        return b;
    }

    async function moderate(id, action) {
        await db.rpc("stream_chat_moderate", { p_id: id, p_action: action });
        lastSig = "";
        refreshChat();
    }

    function renderChat(data) {
        const rows = data.messages || [];
        const host = pass.role === "host";

        const reacts = data.reactions || {};
        el("reactions").textContent = Object.keys(reacts).map(function (k) { return k + " " + reacts[k]; }).join("   ");

        const sig = JSON.stringify(rows.map(function (r) { return [r.id, r.muted]; }));
        if (sig === lastSig) return;
        lastSig = sig;

        const list = el("chatList");
        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        list.textContent = "";

        if (!rows.length) {
            const p = document.createElement("p");
            p.className = "meta";
            p.textContent = "No messages yet. Say hello.";
            list.appendChild(p);
        }

        rows.forEach(function (r) {
            const row = document.createElement("div");
            row.className = "chat-row";

            const who = document.createElement("span");
            who.className = "who";
            who.textContent = r.name + (r.is_host ? " (streamer)" : "");
            row.appendChild(who);

            const text = document.createElement("span");
            text.textContent = r.body;
            row.appendChild(text);

            if (host && !r.is_host) {
                const tools = document.createElement("div");
                tools.className = "chat-tools";
                tools.appendChild(button("Delete", function () { moderate(r.id, "delete"); }));
                tools.appendChild(button(r.muted ? "Unmute " + r.name : "Mute " + r.name, function () { moderate(r.id, r.muted ? "unmute" : "mute"); }));
                row.appendChild(tools);
            }

            list.appendChild(row);
        });

        if (nearBottom) list.scrollTop = list.scrollHeight;
    }

    async function refreshChat() {
        if (!sid || chatBusy || ended) return;
        chatBusy = true;

        try {
            const { data, error } = await db.rpc("stream_chat_list", { p_stream: sid });
            if (!error && data) renderChat(data);
        } finally {
            chatBusy = false;
        }
    }

    async function send(kind, body) {
        const { data, error } = await db.rpc("stream_chat_send", { p_stream: sid, p_kind: kind, p_body: body });

        if (error) { el("chatMsg").className = "msg error"; el("chatMsg").textContent = error.message; return false; }

        if (data && data.ok === false) {
            if (kind === "chat") { el("chatMsg").className = "msg error"; el("chatMsg").textContent = data.message || "Could not send"; }
            return false;
        }

        el("chatMsg").textContent = "";
        refreshChat();
        return true;
    }


    // ---------- Guests on stage ----------

    function stageSay(text, ok) {
        const m = el("stageMsg");
        m.className = "msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    // Ask the livekit-stage function (it may have been saved under a name ending in -ts)
    async function callStage(action, userId) {
        const body = { stream_id: sid, action: action, user_id: userId || null };
        let r = await db.functions.invoke("livekit-stage", { body: body });

        if (r.error && r.error.context && r.error.context.status === 404) {
            r = await db.functions.invoke("livekit-stage-ts", { body: body });
        }

        if (r.error) return { ok: false, message: await errorText(r.error) };
        if (!r.data || r.data.ok === false) return { ok: false, message: (r.data && r.data.error) || "Not allowed" };
        return { ok: true };
    }

    // A guest on stage: microphone and camera buttons, no screen sharing, no ending the stream
    async function becomeGuest(startMedia) {
        el("hostBar").style.display = "";
        el("screenBtn").style.display = "none";
        el("endBtn").style.display = "none";
        setButtons();

        if (!startMedia || (micOn && camOn)) return true;

        // LiveKit needs a moment to apply the new permission
        for (let i = 0; i < 6; i++) {
            try {
                await room.localParticipant.setMicrophoneEnabled(true);
                micOn = true;
                try { await room.localParticipant.setCameraEnabled(true); camOn = true; } catch (e) { /* camera is optional */ }
                setButtons();
                return true;
            } catch (e) {
                await new Promise(function (resolve) { setTimeout(resolve, 700); });
            }
        }

        stageSay("You are on stage, but the microphone could not start. Tap Microphone and allow it.", false);
        return false;
    }

    async function becomeViewer() {
        if (room) {
            try { await room.localParticipant.setMicrophoneEnabled(false); } catch (e) { /* already off */ }
            try { await room.localParticipant.setCameraEnabled(false); } catch (e) { /* already off */ }
        }

        micOn = false;
        camOn = false;
        sharing = false;
        setButtons();
        el("hostBar").style.display = "none";
    }

    function stageButton(label, fn, primary) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = primary ? "contact-btn" : "btn btn-outline";
        b.textContent = label;
        b.addEventListener("click", fn);
        return b;
    }

    function renderStage(s) {
        const host = pass.role === "host";
        const guests = s.onstage || [];
        const hands = s.hands || [];

        handUp = s.raised === true;
        el("handBtn").textContent = handUp ? "Lower hand" : "Raise hand";

        const sig = JSON.stringify([host, s.mine, s.max, guests.map(function (g) { return g.user_id; }), hands.map(function (h) { return h.user_id; })]);
        if (sig === stageSig) return;
        stageSig = sig;

        el("stageInvite").style.display = !host && s.mine === "invited" ? "" : "none";

        const handList = el("handList");
        handList.textContent = "";
        el("handBox").style.display = host && hands.length ? "" : "none";

        hands.forEach(function (h) {
            const row = document.createElement("div");
            row.className = "chat-row";
            const who = document.createElement("span");
            who.className = "who";
            who.textContent = "✋ " + h.name;
            row.appendChild(who);
            row.appendChild(stageButton("Invite up", async function () {
                const { data, error } = await db.rpc("stream_stage_invite", { p_stream: sid, p_user: h.user_id });
                stageSay(error ? error.message : (data && data.ok ? "Invitation sent to " + h.name + "." : (data && data.message) || "Could not invite"), !error && data && data.ok);
                stageSig = "";
                refreshStage();
            }));
            row.appendChild(stageButton("Lower hand", async function () {
                await db.rpc("stream_hand_lower", { p_stream: sid, p_user: h.user_id });
                stageSig = "";
                refreshStage();
            }));
            handList.appendChild(row);
        });

        const list = el("stageList");
        list.textContent = "";

        guests.forEach(function (g) {
            const row = document.createElement("div");
            row.className = "chat-row";
            const who = document.createElement("span");
            who.className = "who";
            who.textContent = "🎤 " + g.name + (g.mine ? " (you)" : "") + " is live on stage";
            row.appendChild(who);

            if (host) {
                row.appendChild(stageButton("Send back", async function () {
                    const r = await callStage("revoke", g.user_id);
                    stageSay(r.ok ? "" : r.message, r.ok);
                    stageSig = "";
                    refreshStage();
                }));
            } else if (g.mine) {
                row.appendChild(stageButton("Leave the stage", async function () {
                    const r = await callStage("revoke", null);
                    stageSay(r.ok ? "" : r.message, r.ok);
                    if (r.ok) { wasOnstage = false; await becomeViewer(); }
                    stageSig = "";
                    refreshStage();
                }));
            }

            list.appendChild(row);
        });

        el("stagePanel").style.display = (guests.length || hands.length || s.mine === "invited") ? "" : "none";
    }

    async function refreshStage() {
        if (!sid || stageBusy || ended) return;
        stageBusy = true;

        try {
            const { data, error } = await db.rpc("stream_stage_status", { p_stream: sid });
            if (error || !data) return;

            // Sent back by the streamer: go back to being a viewer
            if (data.mine !== "onstage" && wasOnstage && pass.role !== "host") {
                wasOnstage = false;
                await becomeViewer();
                stageSay("You are back in the audience.", true);
            }

            if (data.mine === "onstage" && !wasOnstage && pass.role !== "host") {
                wasOnstage = true;
                await becomeGuest(false);
            }

            renderStage(data);
        } finally {
            stageBusy = false;
        }
    }


    // ---------- Gifts (test coins only) ----------

    function giftSay(text, ok) {
        const m = el("giftMsg");
        m.className = "msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    function layerAdd(node, ms) {
        const layer = el("giftLayer");
        layer.appendChild(node);
        setTimeout(function () { node.remove(); }, ms);
    }

    function animateGift(g) {
        const qty = Number(g.qty) > 1 ? " x" + g.qty : "";

        if (g.animation === "big") {
            const d = document.createElement("div");
            d.className = "gift-big";
            const e = document.createElement("span");
            e.className = "e";
            e.textContent = g.emoji;
            const t = document.createElement("span");
            t.className = "t";
            t.textContent = g.name + " sent " + g.gift + qty;
            d.appendChild(e);
            d.appendChild(t);
            layerAdd(d, 3700);
        } else if (g.animation === "burst") {
            for (let i = 0; i < 9; i++) {
                const b = document.createElement("span");
                b.className = "gift-burst";
                b.textContent = g.emoji;
                b.style.left = "50%";
                b.style.top = "60%";
                b.style.setProperty("--dx", Math.round((Math.random() - 0.5) * 280) + "px");
                b.style.setProperty("--dy", Math.round(-40 - Math.random() * 200) + "px");
                layerAdd(b, 1700);
            }
            const n = document.createElement("div");
            n.className = "gift-fly";
            n.style.left = "8%";
            const s = document.createElement("small");
            s.textContent = g.name + qty;
            n.appendChild(s);
            layerAdd(n, 3300);
        } else {
            const f = document.createElement("div");
            f.className = "gift-fly";
            f.style.left = Math.round(5 + Math.random() * 70) + "%";
            f.textContent = g.emoji;
            const s = document.createElement("small");
            s.textContent = g.name + qty;
            f.appendChild(s);
            layerAdd(f, 3300);
        }
    }

    async function refreshGifts() {
        if (!sid || giftBusy || ended) return;
        giftBusy = true;

        try {
            const { data, error } = await db.rpc("stream_gifts_feed", { p_stream: sid, p_after: giftCursor });
            if (error || !data) return;

            giftCursor = data.now;

            (data.gifts || []).slice(-10).forEach(function (g, i) {
                setTimeout(function () { animateGift(g); }, i * 350);
            });

            const top = (data.top || []).map(function (t) { return t.name + " " + t.coins; }).join(" • ");
            el("giftTotal").textContent = "Gifts in this stream: " + Number(data.total || 0) + " coins" + (top ? " • Top: " + top : "");
        } finally {
            giftBusy = false;
        }
    }

    async function buyPack(p, btn) {
        if (typeof PAYSTACK_PUBLIC_KEY === "undefined" || PAYSTACK_PUBLIC_KEY.indexOf("PASTE") === 0) { giftSay("Payments are not set up yet.", false); return; }
        if (typeof PaystackPop === "undefined") { giftSay("The payment window could not load. Check your internet and try again.", false); return; }

        btn.disabled = true;
        const chk = await db.rpc("coin_buy_start", { p_pack: p.id });
        btn.disabled = false;
        if (chk.error || !chk.data || chk.data.ok === false) { giftSay(chk.error ? chk.error.message : (chk.data && chk.data.message) || "Could not start", false); return; }

        const u = await db.auth.getUser();
        const user = u.data && u.data.user;
        if (!user) { giftSay("Please log in again.", false); return; }

        PaystackPop.setup({
            key: PAYSTACK_PUBLIC_KEY,
            email: user.email,
            amount: chk.data.amount_naira * 100,
            currency: "NGN",
            ref: "COIN-" + p.id.slice(0, 8) + "-" + Date.now(),
            metadata: { kind: "coins", pack_id: p.id, buyer_id: user.id },
            callback: function (response) { confirmCoins(response.reference, 1); },
            onClose: function () {}
        }).openIframe();
    }

    async function confirmCoins(reference, attempt) {
        giftSay("Payment received. Adding your coins (try " + attempt + " of 5)...", true);
        const r = await db.functions.invoke("paystack-verify", { body: { reference: reference } });
        const cat = await db.rpc("gift_catalogue");
        if (cat.data) drawTray(cat.data);

        if (!r.error && r.data && !r.data.error) { giftSay("Your coins have been added.", true); return; }
        if (attempt < 5) { setTimeout(function () { confirmCoins(reference, attempt + 1); }, 4000); return; }
        giftSay("We could not add your coins yet. Your money is safe. Contact LBN with this reference: " + reference, false);
    }

    function drawTray(cat) {
        giftBalance = cat.balance;
        el("giftBalance").textContent = cat.balance;
        el("paidBalance").textContent = cat.paid_balance || 0;
        el("coinShop").style.display = cat.sales_on ? "" : "none";
        el("giftNotice").textContent = cat.sales_on
            ? "Gifts use your bought coins first, then your free test coins."
            : "Test mode: gifts use free test coins that have no value. Nothing is paid to the streamer yet.";

        const bar = el("packBar");
        bar.textContent = "";
        (cat.packs || []).forEach(function (p) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn";
            b.textContent = "Buy " + p.coins + " coins - N" + Number(p.price).toLocaleString("en-NG");
            b.addEventListener("click", function () { buyPack(p, b); });
            bar.appendChild(b);
        });
        el("giftClaim").style.display = cat.can_claim ? "" : "none";

        const grid = el("giftGrid");
        grid.textContent = "";

        (cat.gifts || []).forEach(function (g) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "btn btn-outline";
            const e = document.createElement("span");
            e.className = "ge";
            e.textContent = g.emoji;
            const n = document.createElement("span");
            n.textContent = g.name;
            const c = document.createElement("small");
            c.textContent = g.cost + " coins";
            b.appendChild(e);
            b.appendChild(n);
            b.appendChild(c);

            b.addEventListener("click", async function () {
                b.disabled = true;
                const r = await db.rpc("send_stream_gift", { p_stream: sid, p_gift: g.id, p_qty: 1 });
                b.disabled = false;

                if (r.error || !r.data || r.data.ok === false) {
                    giftSay(r.error ? r.error.message : (r.data && r.data.message) || "Could not send", false);
                    if (r.data && r.data.balance !== undefined) { el("giftBalance").textContent = r.data.balance; }
                    return;
                }

                giftSay("", true);
                giftBalance = r.data.balance;
                el("giftBalance").textContent = r.data.balance;
                el("paidBalance").textContent = r.data.paid_balance || 0;
                refreshGifts();
            });

            grid.appendChild(b);
        });
    }

    async function startGifts() {
        el("giftPanel").style.display = "";

        if (pass.role !== "host") {
            const { data, error } = await db.rpc("gift_catalogue");

            if (error || !data) {
                el("giftTotal").textContent = "Gifts are not set up yet.";
            } else {
                el("giftTray").style.display = "";
                drawTray(data);
            }
        }

        refreshGifts();
        giftTimer = setInterval(function () { if (!document.hidden) refreshGifts(); }, 2500);
    }

    // ---------- Joining ----------

    async function join() {
        const button = el("roomJoinBtn");
        button.disabled = true;
        say("Joining...", true);

        const E = LivekitClient.RoomEvent;

        room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: { resolution: LivekitClient.VideoPresets.h720, facingMode: "user" },
            publishDefaults: { simulcast: true, videoEncoding: { maxBitrate: 1700000, maxFramerate: 30 } },
            audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        room
            .on(E.TrackSubscribed, function (track, publication) { attach(track, publication); })
            .on(E.TrackUnsubscribed, function (track) { detach(track); })
            .on(E.TrackPublished, function (publication) {
                if (saveData && publication.kind === "video") publication.setSubscribed(false);
            })
            .on(E.LocalTrackPublished, function (publication) {
                if (publication.kind === "video" && publication.track) {
                    const v = publication.track.attach();
                    v.muted = true;
                    v.playsInline = true;
                    v.setAttribute("playsinline", "");
                    v.className = publication.source === LivekitClient.Track.Source.ScreenShare ? "screen" : "mine";
                    stage.appendChild(v);
                }
                updateStatus();
            })
            .on(E.LocalTrackUnpublished, function (publication) {
                if (publication.track) publication.track.detach().forEach(function (e) { e.remove(); });
                updateStatus();
            })
            .on(E.AudioPlaybackStatusChanged, function () { el("soundBtn").style.display = room.canPlaybackAudio ? "none" : ""; })
            .on(E.Reconnecting, function () { say("Your connection is weak. Trying to reconnect...", false); })
            .on(E.Reconnected, function () { say("", true); msg.className = "msg"; })
            .on(E.Disconnected, function () {
                if (!ended) { clearInterval(beatTimer); clearInterval(chatTimer); clearInterval(stageTimer); clearInterval(giftTimer); el("roomLive").style.display = "none"; say("You left the stream.", true); }
            });

        try {
            await room.connect(pass.url, pass.token);
        } catch (error) {
            button.disabled = false;
            say("Could not join: " + ((error && error.message) || "please try again"), false);
            return;
        }

        try { await room.startAudio(); } catch (e) { el("soundBtn").style.display = ""; }

        el("roomJoinBox").style.display = "none";
        el("roomLive").style.display = "";
        el("hostBar").style.display = pass.role === "host" ? "" : "none";
        el("viewerBar").style.display = pass.role === "host" ? "none" : "";
        el("reactBar").style.display = pass.role === "host" ? "none" : "";
        msg.textContent = "";
        msg.className = "msg";

        if (pass.role === "host") {
            try {
                await room.localParticipant.setMicrophoneEnabled(true);
                micOn = true;
                await room.localParticipant.setCameraEnabled(true);
                camOn = true;
            } catch (e) {
                say("You are live, but the camera or microphone could not start. Tap the buttons and allow them for this site.", false);
            }
            setButtons();
        }

        // A viewer invited on stage earlier gets the buttons back after a refresh
        if (pass.stage && pass.role !== "host") { wasOnstage = true; becomeGuest(false); }

        startGifts();
        refreshStage();
        stageTimer = setInterval(function () { if (!document.hidden) refreshStage(); }, 4000);

        beat();
        refreshChat();
        beatTimer = setInterval(beat, 15000);
        chatTimer = setInterval(function () { if (!document.hidden) refreshChat(); }, 3000);
    }

    async function toggle(kind) {
        if (!room) return;

        try {
            if (kind === "mic") { micOn = !micOn; await room.localParticipant.setMicrophoneEnabled(micOn); }
            else if (kind === "cam") { camOn = !camOn; await room.localParticipant.setCameraEnabled(camOn); }
            else { sharing = !sharing; await room.localParticipant.setScreenShareEnabled(sharing); }
        } catch (error) {
            if (kind === "mic") micOn = !micOn;
            else if (kind === "cam") camOn = !camOn;
            else sharing = !sharing;

            say(kind === "screen"
                ? "Screen sharing is not available on this device. Use a computer to share your screen."
                : "Could not start it. Allow the camera and microphone for this site in your browser settings.", false);
        }

        setButtons();
    }

    el("roomJoinBtn").addEventListener("click", join);
    el("micBtn").addEventListener("click", function () { toggle("mic"); });
    el("camBtn").addEventListener("click", function () { toggle("cam"); });
    el("screenBtn").addEventListener("click", function () { toggle("screen"); });

    el("dataBtn").addEventListener("click", function () {
        saveData = !saveData;
        this.textContent = saveData ? "Save data: turn video on" : "Save data: turn video off";
        applySaveData();
    });

    el("soundBtn").addEventListener("click", async function () {
        if (room) await room.startAudio();
        this.style.display = "none";
    });

    el("endBtn").addEventListener("click", async function () {
        if (!confirm("End your live stream for everyone?")) return;
        await db.rpc("stream_end", { p_stream: sid });
        finish("You ended your stream.");
    });

    el("leaveBtn").addEventListener("click", function () {
        if (pass && pass.role === "host" && !confirm("Leave? Your stream stays live for a few minutes, then ends. Use End the stream to stop it now.")) return;
        if (room) room.disconnect();
        location.href = "streams.html";
    });

    el("giftClaim").addEventListener("click", async function () {
        const { data, error } = await db.rpc("claim_test_coins");
        if (error) { giftSay(error.message, false); return; }
        giftSay(data && data.ok ? "100 free test coins added." : (data && data.message) || "Could not claim", data && data.ok);
        const cat = await db.rpc("gift_catalogue");
        if (cat.data) drawTray(cat.data);
    });

    el("handBtn").addEventListener("click", async function () {
        const { data, error } = await db.rpc("stream_hand_toggle", { p_stream: sid });
        if (error || !data || data.ok === false) { say(error ? error.message : (data && data.message) || "Could not raise your hand", false); return; }
        stageSay(data.raised ? "Your hand is up. The streamer can invite you." : "", true);
        stageSig = "";
        refreshStage();
    });

    el("stageAccept").addEventListener("click", async function () {
        const b = this;
        b.disabled = true;
        stageSay("Taking you on stage...", true);

        const r = await callStage("grant", null);

        if (!r.ok) { stageSay(r.message, false); b.disabled = false; stageSig = ""; refreshStage(); return; }

        wasOnstage = true;
        stageSig = "";
        stageSay("You are live on stage. Everyone watching can see and hear you.", true);
        await becomeGuest(true);
        b.disabled = false;
        refreshStage();
    });

    el("stageDecline").addEventListener("click", async function () {
        await db.rpc("stream_stage_decline", { p_stream: sid });
        stageSig = "";
        stageSay("", true);
        refreshStage();
    });

    el("reportBtn").addEventListener("click", async function () {
        const reason = prompt("What is wrong with this stream? (5 to 300 characters)");
        if (!reason) return;
        const { data, error } = await db.rpc("stream_report", { p_stream: sid, p_reason: reason });
        say(error ? error.message : (data && data.ok ? "Thank you. The LBN team will look at it." : (data && data.message) || "Could not send"), !error && data && data.ok);
    });

    el("reactBar").addEventListener("click", function (event) {
        const b = event.target.closest("button[data-react]");
        if (b) send("reaction", b.dataset.react);
    });

    el("chatForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        const input = el("chatInput");
        const text = input.value.trim();
        if (!text) return;

        el("chatSend").disabled = true;
        if (await send("chat", text)) input.value = "";
        el("chatSend").disabled = false;
        input.focus();
    });

    window.addEventListener("pagehide", function () { if (room) room.disconnect(); });

    init();
})();