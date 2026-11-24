function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

var logoutLink = document.getElementById("logoutBtn");
if (logoutLink) {
    logoutLink.addEventListener("click", async function (event) {
        event.preventDefault();
        if (db) await db.auth.signOut();
        window.location.href = "auth.html";
    });
}

const msg = document.getElementById("appMsg");

function say(text, kind) {
    msg.textContent = text || "";
    msg.className = "msg " + (kind || "");
}

function val(id) {
    return document.getElementById(id).value.trim();
}

async function init() {
    if (!db) { say("Supabase is not connected yet.", "error"); return; }

    const { data: sessionData } = await db.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("ambassador-apply.html");
        return;
    }

    const user = sessionData.session.user;
    const status = await db.rpc("my_ambassador_status");
    const box = document.getElementById("appStatus");

    if (status.error) {
        say("Not set up yet. Run supabase-ambassadors.sql in Supabase.", "error");
        return;
    }

    const s = status.data || {};

    if (s.state === "ambassador") {
        box.style.display = "";
        box.innerHTML = s.appointment_status === "trial"
            ? "<h2>You are on your two-week trial</h2><p>Your trial ends on " + escapeHTML(new Date(s.trial_end).toLocaleDateString()) + ". Final approval follows the trial.</p>"
            : "<h2>You are an LBN ambassador</h2><p>Status: " + escapeHTML(s.appointment_status) + (s.appointment_end ? ". Appointment until " + escapeHTML(new Date(s.appointment_end).toLocaleDateString()) : "") + ".</p>";

        if (s.appointment_status === "confirmed") {
            box.innerHTML += '<p><a class="contact-btn" href="ambassador-certificate.html">My certificate</a></p>';
        }

        box.innerHTML += '<p><button type="button" class="btn btn-outline" id="resignBtn">Resign from my position</button></p>';

        document.getElementById("resignBtn").addEventListener("click", async function () {
            const reason = prompt("You are about to resign. Your place will open for someone else. Reason (optional):", "");
            if (reason === null) return;
            const { error } = await db.rpc("ambassador_resign", { p_reason: reason });
            if (error) { say(error.message, "error"); return; }
            window.location.reload();
        });

        return;
    }

    if (s.state === "applied") {
        box.style.display = "";
        box.innerHTML = "<h2>Your application is in</h2><p>Sent on " + escapeHTML(new Date(s.created_at).toLocaleDateString()) +
            ". Status: " + (s.status === "reviewing" ? "under review" : "received") +
            ". We will tell you here and in your notifications.</p>" +
            '<button type="button" class="btn btn-outline" id="withdrawBtn">Withdraw my application</button>';
        document.getElementById("withdrawBtn").addEventListener("click", async function () {
            if (!confirm("Withdraw your application?")) return;
            const { error } = await db.rpc("withdraw_ambassador_application");
            if (error) { say(error.message, "error"); return; }
            window.location.reload();
        });
        return;
    }

    const profile = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    document.getElementById("aName").value = (profile.data && profile.data.full_name) || "";
    document.getElementById("aEmail").value = user.email || "";

    const schools = await db.rpc("ambassador_vacancies");
    const seen = {};
    const select = document.getElementById("aSchool");

    (schools.data || []).forEach(function (row) {
        if (seen[row.school_id]) return;
        seen[row.school_id] = true;
        const option = document.createElement("option");
        option.value = row.school_id;
        option.textContent = row.school_name;
        select.appendChild(option);
    });

    if (s.last_status === "rejected") {
        say("Your last application was not successful. You are welcome to apply again.", "");
    }

    document.getElementById("appFormBox").style.display = "";
}

document.getElementById("appForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    say("");

    if (val("aTrial") !== "yes") {
        say("You must agree to the two-week trial period to apply.", "error");
        return;
    }

    const button = document.getElementById("aSubmit");
    button.disabled = true;

    const reach = val("aReach");

    const { error } = await db.rpc("submit_ambassador_application", {
        p_whatsapp: val("aWhatsapp"),
        p_audience: val("aAudience"),
        p_school: val("aSchool") || null,
        p_community: val("aCommunity"),
        p_country: val("aCountry"),
        p_course_or_business: val("aCourse"),
        p_leadership: val("aLeadership"),
        p_social_links: val("aSocial"),
        p_whatsapp_groups: val("aGroups"),
        p_audience_size: val("aSize"),
        p_first_month_reach: reach === "" ? null : parseInt(reach, 10),
        p_why: val("aWhy"),
        p_referee_name: val("aRefName"),
        p_referee_contact: val("aRefContact"),
        p_agrees_trial: true
    });

    button.disabled = false;

    if (error) {
        say(error.message, "error");
        return;
    }

    document.getElementById("appFormBox").style.display = "none";
    say("Thank you. Your application was sent. Our team will review it and tell you the result here and in your notifications.", "ok");
});

init();