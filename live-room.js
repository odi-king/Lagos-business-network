// LBN Phase 8A: the live class room (video and audio). Works with supabase-live-room.sql and the livekit-token function.
// The lecturer who owns the class is the host (camera, microphone, screen). Everybody else watches and listens.

(function () {
    const msg = document.getElementById("roomMsg");
    const joinBox = document.getElementById("roomJoinBox");
    const liveBox = document.getElementById("roomLive");
    const stage = document.getElementById("stage");
    const status = document.getElementById("roomStatus");

    let room = null;
    let pass = null;
    let saveData = false;
    let micOn = false;
    let camOn = false;
    let sharing = false;

    function say(text, ok) {
        msg.className = "msg " + (ok ? "ok" : "error");
        msg.textContent = text;
    }

    function updateStatus() {
        if (!room) return;

        const others = room.remoteParticipants.size;
        const people = others + 1;
        let text = people + (people === 1 ? " person is here." : " people are here.");

        if (pass.role === "student" && !stage.querySelector("video") && !document.querySelector("audio[data-lbn]")) {
            text += " Waiting for the lecturer to start...";
        }

        status.textContent = text;
    }

    async function errorText(error) {
        try {
            if (error && error.context && typeof error.context.json === "function") {
                const body = await error.context.json();
                if (body && body.error) return body.error;
            }
        } catch (e) { /* fall through */ }

        return (error && error.message) || "Something went wrong. Please try again.";
    }

    async function init() {
        if (!db || typeof LivekitClient === "undefined") {
            say("The live room could not load. Please check your internet and refresh.", false);
            return;
        }

        const id = (new URLSearchParams(location.search).get("s") || "").trim();

        if (!id) {
            say("Open a live class from the Live classes page.", false);
            return;
        }

        const { data } = await db.auth.getSession();

        if (!data.session) {
            location.href = "auth.html?next=" + encodeURIComponent("live-room.html?s=" + id);
            return;
        }

        const result = await db.functions.invoke("livekit-token", { body: { session_id: id } });

        if (result.error || !result.data || !result.data.token) {
            say(await errorText(result.error || { message: (result.data && result.data.error) || "" }), false);
            return;
        }

        pass = result.data;

        document.getElementById("roomTitle").textContent = pass.title || "Live class";
        document.getElementById("roomInfo").textContent = new Date(pass.starts_at).toLocaleString();

        document.getElementById("roomJoinText").textContent = pass.role === "host"
            ? "You are the lecturer. When you join, you start your camera and microphone from the buttons below."
            : "You will watch and listen. If your data is limited, turn the video off after you join: you keep the sound.";

        joinBox.style.display = "";
    }

    function attach(track, participant, publication) {
        if (track.kind === "video") {
            const el = track.attach();
            el.playsInline = true;
            el.setAttribute("playsinline", "");
            if (publication && publication.source === LivekitClient.Track.Source.ScreenShare) el.className = "screen";
            el.dataset.sid = track.sid;
            stage.appendChild(el);
        } else if (track.kind === "audio") {
            const el = track.attach();
            el.dataset.lbn = "1";
            el.dataset.sid = track.sid;
            document.body.appendChild(el);
        }

        updateStatus();
    }

    function detach(track) {
        track.detach().forEach(function (el) { el.remove(); });
        updateStatus();
    }

    function applySaveData() {
        if (!room) return;

        room.remoteParticipants.forEach(function (p) {
            p.trackPublications.forEach(function (pub) {
                if (pub.kind === "video") pub.setSubscribed(!saveData);
            });
        });
    }

    function setButtons() {
        document.getElementById("micBtn").textContent = "Microphone: " + (micOn ? "on" : "off");
        document.getElementById("camBtn").textContent = "Camera: " + (camOn ? "on" : "off");
        document.getElementById("screenBtn").textContent = sharing ? "Stop sharing" : "Share screen";
    }

    async function join() {
        const button = document.getElementById("roomJoinBtn");
        button.disabled = true;
        say("Joining...", true);

        const E = LivekitClient.RoomEvent;

        room = new LivekitClient.Room({
            adaptiveStream: true,
            dynacast: true,
            videoCaptureDefaults: { resolution: LivekitClient.VideoPresets.h540 },
            audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        room
            .on(E.TrackSubscribed, function (track, publication, participant) { attach(track, participant, publication); })
            .on(E.TrackUnsubscribed, function (track) { detach(track); })
            .on(E.TrackPublished, function (publication) {
                if (saveData && publication.kind === "video") publication.setSubscribed(false);
            })
            .on(E.ParticipantConnected, updateStatus)
            .on(E.ParticipantDisconnected, updateStatus)
            .on(E.LocalTrackPublished, function (publication) {
                if (publication.kind === "video" && publication.track) {
                    const el = publication.track.attach();
                    el.muted = true;
                    el.playsInline = true;
                    el.setAttribute("playsinline", "");
                    if (publication.source === LivekitClient.Track.Source.ScreenShare) el.className = "screen";
                    el.dataset.local = "1";
                    stage.appendChild(el);
                }
                updateStatus();
            })
            .on(E.LocalTrackUnpublished, function (publication) {
                if (publication.track) publication.track.detach().forEach(function (el) { el.remove(); });
                updateStatus();
            })
            .on(E.AudioPlaybackStatusChanged, function () {
                document.getElementById("soundBtn").style.display = room.canPlaybackAudio ? "none" : "";
            })
            .on(E.Reconnecting, function () { say("Your connection is weak. Trying to reconnect...", false); })
            .on(E.Reconnected, function () { say("Back in the class.", true); })
            .on(E.Disconnected, function () {
                liveBox.style.display = "none";
                say("You left the class. You can join again from the Live classes page.", true);
            });

        try {
            await room.connect(pass.url, pass.token);
            // Opening the sound needs a tap on phones; this tap is it
            await room.startAudio();
        } catch (error) {
            button.disabled = false;
            say("Could not join the class: " + ((error && error.message) || "please try again"), false);
            return;
        }

        joinBox.style.display = "none";
        liveBox.style.display = "";
        document.getElementById("hostBar").style.display = pass.role === "host" ? "" : "none";
        document.getElementById("viewerBar").style.display = pass.role === "host" ? "none" : "";
        msg.textContent = "";
        msg.className = "msg";
        updateStatus();
    }

    async function toggle(kind) {
        if (!room) return;

        try {
            if (kind === "mic") {
                micOn = !micOn;
                await room.localParticipant.setMicrophoneEnabled(micOn);
            } else if (kind === "cam") {
                camOn = !camOn;
                await room.localParticipant.setCameraEnabled(camOn);
            } else {
                sharing = !sharing;
                await room.localParticipant.setScreenShareEnabled(sharing);
            }
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

    document.getElementById("roomJoinBtn").addEventListener("click", join);
    document.getElementById("micBtn").addEventListener("click", function () { toggle("mic"); });
    document.getElementById("camBtn").addEventListener("click", function () { toggle("cam"); });
    document.getElementById("screenBtn").addEventListener("click", function () { toggle("screen"); });

    document.getElementById("dataBtn").addEventListener("click", function () {
        saveData = !saveData;
        this.textContent = saveData ? "Save data: turn video on" : "Save data: turn video off";
        applySaveData();
    });

    document.getElementById("soundBtn").addEventListener("click", async function () {
        if (room) await room.startAudio();
        this.style.display = "none";
    });

    document.getElementById("leaveBtn").addEventListener("click", function () {
        if (room) room.disconnect();
        else location.href = "live.html";
    });

    window.addEventListener("pagehide", function () { if (room) room.disconnect(); });

    init();
})();