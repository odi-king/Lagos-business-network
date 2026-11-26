// LBN Phase 11E: the Representatives conference room (private video meeting).
// Works with supabase-conference.sql, the livekit-token-ts function and the livekit-conference function.
// Video is captured at 720p and shown whole (never cropped), the same as the live streams.

(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function say(t, ok) { const m = el("confMsg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }

    const cid = (new URLSearchParams(location.search).get("c") || "").trim();
    let room = null;
    let pass = null;
    let micOn = false;
    let camOn = false;
    let sharing = false;
    let timer = null;
    const tiles = {};

    async function errorText(error) {
        try {
            const res = error && error.context;
            if (res && typeof res.text === "function") {
                const raw = await res.text();
                let reason = raw;
                try { const b = JSON.parse(raw); reason = b.error || b.message || raw; } catch (e) { /* keep text */ }
                return String(reason || "No details").slice(0, 200);
            }
        } catch (e) { /* fall through */ }
        return (error && error.message) || "Something went wrong. Please try again.";
    }

    async function init() {
        if (!db || typeof LivekitClient === "undefined") { say("The meeting room could not load. Please check your internet and refresh.", false); return; }
        if (!cid) { location.href = "conferences.html"; return; }

        const { data } = await db.auth.getSession();
        if (!data.session) { location.href = "auth.html?next=" + encodeURIComponent("conference.html?c=" + cid); return; }

        const r = await db.functions.invoke("livekit-token-ts", { body: { conference_id: cid } });
        if (r.error || !r.data || !r.data.token) { say(await errorText(r.error || { message: (r.data && r.data.error) || "" }), false); return; }

        pass = r.data;
        el("confTitle").textContent = pass.title || "Representatives meeting";
        el("joinBox").style.display = "";
    }

    function tileFor(identity, name) {
        if (tiles[identity]) return tiles[identity];
        const t = document.createElement("div");
        t.className = "tile";
        t.innerHTML = '<div class="ph">' + esc((name || "?").charAt(0).toUpperCase()) + '</div><span class="nm">' + esc(name || "Member") + '</span>';
        el("grid").appendChild(t);
        tiles[identity] = t;
        return t;
    }

    function dropTile(identity) {
        if (tiles[identity]) { tiles[identity].remove(); delete tiles[identity]; }
    }

    function addVideo(identity, name, track, source, local) {
        const t = tileFor(identity, name);
        const v = track.attach();
        v.playsInline = true;
        v.setAttribute("playsinline", "");
        if (local) { v.muted = true; if (source !== LivekitClient.Track.Source.ScreenShare) v.className = "mine"; }
        v.dataset.src = source === LivekitClient.Track.Source.ScreenShare ? "screen" : "cam";
        if (source === LivekitClient.Track.Source.ScreenShare) t.classList.add("screen");
        t.insertBefore(v, t.firstChild);
        const ph = t.querySelector(".ph");
        if (ph) ph.style.display = "none";
    }

    function removeVideo(identity, track) {
        track.detach().forEach(function (v) { v.remove(); });
        const t = tiles[identity];
        if (!t) return;
        t.classList.remove("screen");
        if (!t.querySelector("video")) { const ph = t.querySelector(".ph"); if (ph) ph.style.display = ""; }
    }

    function drawPeople() {
        if (!room) return;
        const mod = pass.role === "host" || pass.role === "moderator";
        const list = [room.localParticipant].concat(Array.from(room.remoteParticipants.values()));
        el("confStatus").textContent = list.length + (list.length === 1 ? " person is here." : " people are here.");

        el("people").innerHTML = list.map(function (p) {
            const me = p === room.localParticipant;
            let role = "";
            try { role = JSON.parse(p.metadata || "{}").role || ""; } catch (e) { role = ""; }
            const label = role === "host" ? " (host)" : role === "moderator" ? " (management)" : "";
            const canTalk = p.permissions ? p.permissions.canPublish : true;
            return '<div class="prow" data-id="' + esc(p.identity) + '"><span class="n">' + esc(p.name || "Member") + (me ? " (you)" : "") + label + (canTalk ? "" : " - listening only") + '</span>' +
                (mod && !me && role !== "host" ? '<button type="button" class="btn btn-outline" data-act="' + (canTalk ? "stop" : "allow") + '">' + (canTalk ? "Stop speaking" : "Allow speaking") + '</button>' +
                    '<button type="button" class="btn btn-outline" data-act="remove">Remove</button>' : '') + '</div>';
        }).join("");
    }

    function setButtons() {
        el("micBtn").textContent = "Microphone: " + (micOn ? "on" : "off");
        el("camBtn").textContent = "Camera: " + (camOn ? "on" : "off");
        el("screenBtn").textContent = sharing ? "Stop sharing" : "Share screen";
    }

    async function pollState() {
        const { data } = await db.rpc("conference_state", { p_conf: cid });
        if (!data) return;
        if (data.status !== "live" || data.removed) {
            say(data.removed ? "You were removed from this meeting." : "The meeting has ended.", false);
            if (room) room.disconnect();
        }
    }

    async function join() {
        el("joinBtn").disabled = true;
        say("Joining...", true);
        const E = LivekitClient.RoomEvent;
        const S = LivekitClient.Track.Source;

        room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: { resolution: LivekitClient.VideoPresets.h720, facingMode: "user" },
            publishDefaults: { simulcast: true, videoEncoding: { maxBitrate: 1700000, maxFramerate: 30 } },
            audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        room
            .on(E.TrackSubscribed, function (track, pub, p) {
                if (track.kind === "video") addVideo(p.identity, p.name, track, pub.source, false);
                else { const a = track.attach(); a.dataset.lbn = "1"; document.body.appendChild(a); }
                drawPeople();
            })
            .on(E.TrackUnsubscribed, function (track, pub, p) {
                if (track.kind === "video") removeVideo(p.identity, track);
                else track.detach().forEach(function (a) { a.remove(); });
                drawPeople();
            })
            .on(E.LocalTrackPublished, function (pub) {
                if (pub.kind === "video" && pub.track) addVideo(room.localParticipant.identity, room.localParticipant.name, pub.track, pub.source, true);
                drawPeople();
            })
            .on(E.LocalTrackUnpublished, function (pub) {
                if (pub.kind === "video" && pub.track) removeVideo(room.localParticipant.identity, pub.track);
                drawPeople();
            })
            .on(E.ParticipantConnected, function (p) { tileFor(p.identity, p.name); drawPeople(); })
            .on(E.ParticipantDisconnected, function (p) { dropTile(p.identity); drawPeople(); })
            .on(E.ParticipantPermissionsChanged, drawPeople)
            .on(E.AudioPlaybackStatusChanged, function () { el("soundBtn").style.display = room.canPlaybackAudio ? "none" : ""; })
            .on(E.Reconnecting, function () { say("Your connection is weak. Trying to reconnect...", false); })
            .on(E.Reconnected, function () { say("Back in the meeting.", true); })
            .on(E.Disconnected, function () {
                clearInterval(timer);
                el("liveBox").style.display = "none";
                Object.keys(tiles).forEach(dropTile);
                if (!el("confMsg").textContent) say("You left the meeting.", true);
            });

        try {
            await room.connect(pass.url, pass.token);
        } catch (error) {
            el("joinBtn").disabled = false;
            say("Could not join: " + ((error && error.message) || "please try again"), false);
            return;
        }

        try { await room.startAudio(); } catch (e) { el("soundBtn").style.display = ""; }

        el("joinBox").style.display = "none";
        el("liveBox").style.display = "";
        say("", true);
        tileFor(room.localParticipant.identity, room.localParticipant.name);
        room.remoteParticipants.forEach(function (p) { tileFor(p.identity, p.name); });
        drawPeople();
        setButtons();
        timer = setInterval(pollState, 6000);
    }

    async function toggle(kind) {
        if (!room) return;
        try {
            if (kind === "mic") { micOn = !micOn; await room.localParticipant.setMicrophoneEnabled(micOn); }
            else if (kind === "cam") { camOn = !camOn; await room.localParticipant.setCameraEnabled(camOn); }
            else { sharing = !sharing; await room.localParticipant.setScreenShareEnabled(sharing); }
        } catch (e) {
            if (kind === "mic") micOn = !micOn; else if (kind === "cam") camOn = !camOn; else sharing = !sharing;
            say(room.localParticipant.permissions && !room.localParticipant.permissions.canPublish
                ? "The host has not allowed you to speak yet."
                : kind === "screen" ? "Screen sharing is not available on this device. Use a computer to share your screen." : "Could not start it. Allow the camera and microphone for this site in your browser settings.", false);
        }
        setButtons();
    }

    el("people").addEventListener("click", async function (e) {
        const b = e.target.closest("button[data-act]");
        if (!b) return;
        const act = b.dataset.act;
        if (act === "remove" && !confirm("Remove this person from the meeting? They cannot come back into it.")) return;
        const r = await db.functions.invoke("livekit-conference", { body: { conference_id: cid, action: act, user_id: b.closest("[data-id]").dataset.id } });
        if (r.error || !r.data || r.data.ok === false) say(r.error ? await errorText(r.error) : (r.data && r.data.error) || "Could not do that", false);
        else say("Done.", true);
    });

    el("joinBtn").addEventListener("click", join);
    el("micBtn").addEventListener("click", function () { toggle("mic"); });
    el("camBtn").addEventListener("click", function () { toggle("cam"); });
    el("screenBtn").addEventListener("click", function () { toggle("screen"); });
    el("soundBtn").addEventListener("click", async function () { if (room) await room.startAudio(); this.style.display = "none"; });
    el("leaveBtn").addEventListener("click", function () { if (room) room.disconnect(); else location.href = "conferences.html"; });
    window.addEventListener("pagehide", function () { if (room) room.disconnect(); });

    init();
})();