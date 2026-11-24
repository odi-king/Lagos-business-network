// LBN Phase 7B: an uploaded video lesson is completed by really watching it.
// class.js calls trackWatch(video, lessonId, card) when a student presses Watch.
// Works with supabase-watch.sql. Uses globals from class.js (db, completedLessons, completeButton).

async function trackWatch(video, lessonId, card) {
    if (typeof db === "undefined" || !db || completedLessons.has(lessonId)) return;

    const status = await db.rpc("lesson_watch_status", { p_lesson_id: lessonId });

    // The database update has not been run yet: do nothing (the old button still works until then)
    if (status.error || !status.data || status.data.completed) return;

    const note = card.querySelector(".watch-note");

    let counter = Number(status.data.watched) || 0;
    let lastReported = counter;
    let lastTime = null;
    let maxPosition = 0;
    let busy = false;
    let finished = false;

    function showProgress() {
        if (!note || finished) return;

        const total = Number(status.data.duration) || video.duration || 0;
        const percent = total > 0 ? Math.min(100, Math.round(counter / total * 100)) : 0;

        note.textContent = "Watch the whole video to complete this lesson. Your progress: " + percent + "%";
    }

    async function report() {
        if (busy || finished) return;

        busy = true;
        const sent = counter;

        const result = await db.rpc("lesson_watch_report", {
            p_lesson_id: lessonId,
            p_watched: sent,
            p_position: maxPosition,
            p_duration: video.duration || 0
        });

        busy = false;
        lastReported = sent;

        if (result.error || !result.data || !result.data.tracked) return;

        status.data.duration = result.data.duration;

        // The database is the judge: if it counted less than we sent, we follow it
        if (result.data.watched < sent) counter = result.data.watched + (counter - sent);

        if (result.data.completed) {
            finished = true;
            completedLessons.add(lessonId);

            if (note) {
                note.outerHTML = completeButton({ id: lessonId, video_path: "done" });
            }
            return;
        }

        showProgress();
    }

    video.addEventListener("timeupdate", function () {
        const t = video.currentTime;

        // Only normal playing counts. A jump forward (skipping) is not counted.
        if (!video.paused && !video.seeking && lastTime !== null) {
            const step = t - lastTime;
            if (step > 0 && step < 3) counter += step;
        }

        lastTime = t;
        if (t > maxPosition) maxPosition = t;

        if (counter - lastReported >= 15) report();
    });

    video.addEventListener("seeking", function () { lastTime = null; });
    video.addEventListener("seeked", function () { lastTime = video.currentTime; });
    video.addEventListener("pause", function () { if (counter > lastReported) report(); });
    video.addEventListener("ended", function () { maxPosition = video.duration || maxPosition; report(); });

    showProgress();
}