// Floating Feedback button on every page. Brings its own styles, so style.css is not touched.

(function () {
    const page = (window.location.pathname.split("/").pop() || "index.html");

    // Not on full-screen or typing-heavy pages, where the button would be in the way
    if (["reels.html", "chat.html", "404.html"].indexOf(page) !== -1) return;
    if (typeof db === "undefined" || !db) return;

    const style = document.createElement("style");
    style.textContent =
        ".fb-btn{position:fixed;right:14px;bottom:16px;z-index:55;display:flex;align-items:center;gap:6px;min-height:44px;padding:0 16px;" +
        "border-radius:999px;border:1px solid var(--accent,#22d3a0);background:var(--card,#111a2e);color:var(--accent,#22d3a0);" +
        "font:inherit;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4)}" +
        "body.has-bottom-nav .fb-btn{bottom:calc(78px + env(safe-area-inset-bottom,0px))}" +
        "@media (min-width:900px){body.has-bottom-nav .fb-btn{bottom:16px}}" +
        ".fb-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.6);display:none;align-items:flex-end;justify-content:center}" +
        ".fb-overlay.open{display:flex}" +
        ".fb-card{background:var(--bg,#0b1220);border:1px solid var(--line,#1f2a44);border-radius:16px 16px 0 0;width:100%;max-width:560px;" +
        "max-height:92vh;overflow-y:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px))}" +
        "@media (min-width:700px){.fb-overlay{align-items:center}.fb-card{border-radius:16px}}" +
        ".fb-card h2{margin:0 0 4px;font-size:20px}" +
        ".fb-card label{display:block;margin:14px 0 6px;font-weight:600}" +
        ".fb-card textarea{min-height:90px}" +
        ".fb-actions{display:flex;gap:10px;margin-top:16px}" +
        ".fb-actions .btn{flex:1;text-align:center}" +
        ".fb-msg{margin:12px 0 0;font-size:15px}" +
        ".fb-msg.error{color:var(--danger,#e5484d)}.fb-msg.ok{color:var(--accent,#22d3a0)}";
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "fb-btn";
    button.setAttribute("aria-label", "Send feedback");
    button.textContent = "✍ Feedback";

    const overlay = document.createElement("div");
    overlay.className = "fb-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Send feedback");
    overlay.innerHTML =
        '<div class="fb-card">' +
        "<h2>Tell us what you think</h2>" +
        '<p class="meta" style="margin:0;">Your feedback helps us make LBN better. It only takes a minute.</p>' +
        '<form id="fbForm" style="display:block;">' +
        '<label for="fbLikes">What do you like?</label>' +
        '<textarea id="fbLikes" maxlength="2000" placeholder="For example: the lessons, the marketplace..."></textarea>' +
        '<label for="fbProblems">What is confusing or not working?</label>' +
        '<textarea id="fbProblems" maxlength="2000" placeholder="Tell us what went wrong or what you could not find"></textarea>' +
        '<label for="fbContact">Email or phone (optional)</label>' +
        '<input type="text" id="fbContact" maxlength="120" placeholder="Only if you want us to reply" autocomplete="off">' +
        '<p id="fbMsg" class="fb-msg"></p>' +
        '<div class="fb-actions"><button type="button" id="fbClose" class="btn btn-outline">Close</button>' +
        '<button type="submit" id="fbSend" class="btn btn-primary">Send</button></div>' +
        "</form></div>";

    document.body.appendChild(button);
    document.body.appendChild(overlay);

    const likes = overlay.querySelector("#fbLikes");
    const problems = overlay.querySelector("#fbProblems");
    const contact = overlay.querySelector("#fbContact");
    const msg = overlay.querySelector("#fbMsg");
    const send = overlay.querySelector("#fbSend");

    function say(text, type) {
        msg.textContent = text || "";
        msg.className = "fb-msg " + (type || "");
    }

    function device() {
        if (typeof deviceId === "function") return deviceId();

        try {
            return localStorage.getItem("lbn_device") || "";
        } catch (error) {
            return "";
        }
    }

    function open() {
        say("");
        send.disabled = false;
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
        likes.focus();
    }

    function close() {
        overlay.classList.remove("open");
        document.body.style.overflow = "";
    }

    button.addEventListener("click", open);
    overlay.querySelector("#fbClose").addEventListener("click", close);

    overlay.addEventListener("click", function (event) {
        if (event.target === overlay) close();
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && overlay.classList.contains("open")) close();
    });

    overlay.querySelector("#fbForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const a = likes.value.trim();
        const b = problems.value.trim();

        if (!a && !b) {
            say("Please write something before sending.", "error");
            return;
        }

        send.disabled = true;
        say("Sending...", "ok");

        let failed = null;

        try {
            const result = await db.rpc("submit_feedback", {
                p_page: page,
                p_likes: a,
                p_problems: b,
                p_contact: contact.value.trim(),
                p_device: device()
            });

            failed = result.error;
        } catch (error) {
            failed = error;
        }

        if (failed) {
            const text = String(failed.message || "");

            say(/could not find the function|schema cache/i.test(text)
                ? "Feedback is not switched on yet. Please try again later."
                : /Failed to fetch|network/i.test(text)
                    ? "We could not send that. Please check your internet and try again."
                    : text || "We could not send that. Please try again.", "error");

            send.disabled = false;
            return;
        }

        likes.value = "";
        problems.value = "";
        contact.value = "";
        say("Thank you! Your feedback helps us improve LBN.", "ok");

        setTimeout(close, 1800);
    });
})();