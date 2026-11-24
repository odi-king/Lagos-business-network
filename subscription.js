function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const msg = document.getElementById("subMsg");

function say(text, kind) {
    msg.textContent = text || "";
    msg.className = "msg " + (kind || "");
}

function longDate(value) {
    return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

async function init() {
    const box = document.getElementById("subBox");

    if (!db) { box.innerHTML = "<p class='meta'>Not available right now.</p>"; return; }

    const { data: sessionData } = await db.auth.getSession();
    if (!sessionData.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("subscription.html");
        return;
    }

    const { data, error } = await db.rpc("my_subscription");

    if (error) {
        box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-cancel.sql in Supabase.</p>";
        return;
    }

    if (!data.has_membership || !data.active) {
        box.innerHTML = "<h2>No active subscription</h2><p class='meta'>" +
            (data.has_membership ? "Your membership ended on " + escapeHTML(longDate(data.paid_until)) + ". Nothing more will be charged." : "You do not have a subscription yet.") +
            "</p><p><a class='contact-btn' href='pay.html'>Join or renew</a></p>";
        return;
    }

    const kind = data.is_free_trial ? "Free month" : "Yearly membership";
    const history = (data.history || []).length === 0 ? "" :
        "<h3>History</h3>" + data.history.map(function (h) {
            return "<p class='meta'>" + escapeHTML(longDate(h.created_at)) + " &bull; " + (h.event === "cancelled" ? "Cancelled" : "Resumed") + "</p>";
        }).join("");

    if (data.cancel_at_period_end) {
        box.innerHTML =
            "<h2>" + escapeHTML(kind) + ": cancelled</h2>" +
            "<p>You have cancelled. You can keep using everything until <strong>" + escapeHTML(longDate(data.paid_until)) + "</strong>. After that your membership ends and you will not be charged again.</p>" +
            "<p><button type='button' class='contact-btn' id='resumeBtn'>Keep my subscription</button></p>" + history;

        document.getElementById("resumeBtn").addEventListener("click", async function () {
            say("");
            const res = await db.rpc("resume_subscription");
            if (res.error) { say(res.error.message, "error"); return; }
            say("Your subscription will continue.", "ok");
            await init();
        });
        return;
    }

    box.innerHTML =
        "<h2>" + escapeHTML(kind) + ": active</h2>" +
        "<p>Your access runs until <strong>" + escapeHTML(longDate(data.paid_until)) + "</strong>.</p>" +
        "<p class='meta'>If you cancel, you keep full access until that date and we will not charge you again. You can change your mind any time before it ends.</p>" +
        "<label class='meta' for='cancelReason'>Why are you leaving? (optional, helps us improve)</label>" +
        "<input type='text' id='cancelReason' maxlength='300'>" +
        "<p><button type='button' class='btn btn-outline' id='cancelBtn'>Cancel subscription</button></p>" + history;

    document.getElementById("cancelBtn").addEventListener("click", async function () {
        if (!confirm("Cancel your subscription? You keep access until " + longDate(data.paid_until) + ".")) return;
        say("");
        const res = await db.rpc("cancel_subscription", { p_reason: document.getElementById("cancelReason").value });
        if (res.error) { say(res.error.message, "error"); return; }
        say("Your subscription is cancelled. You keep access until " + longDate(res.data) + ".", "ok");
        await init();
    });
}

const logoutLink = document.getElementById("logoutBtn");
if (logoutLink) logoutLink.addEventListener("click", async function (e) { e.preventDefault(); if (db) await db.auth.signOut(); window.location.href = "auth.html"; });

init();