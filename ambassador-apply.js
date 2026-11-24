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

        await showCareer(box);
        await showEarnings(box);

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

function money(kobo) {
    return "\u20A6" + (Number(kobo || 0) / 100).toLocaleString();
}

const RANK_NAME = { school: "School Ambassador", senior: "Senior Ambassador", regional_manager: "Regional Ambassador Manager", national_director: "National Ambassador Director" };

async function showCareer(box) {
    const { data, error } = await db.rpc("my_ambassador_career");
    if (error || !data) return;

    const p = data.performance;
    const moves = data.changes.length === 0 ? "<p class='meta'>No promotions or transfers yet.</p>" : data.changes.map(function (c) {
        let line = "";
        if (c.type === "promotion" || c.type === "rank_change") line = (c.type === "promotion" ? "Promotion: " : "Rank change: ") + RANK_NAME[c.old_rank] + " to " + RANK_NAME[c.new_rank];
        else if (c.type === "salary") line = "Salary changed to " + money(c.new_salary_kobo);
        else if (c.type === "transfer") line = "Transferred to " + (c.new_school || "another school");
        else line = "School " + (c.detail || "") + ": " + (c.new_school || "");
        return "<p class='meta'>" + escapeHTML(new Date(c.created_at).toLocaleDateString()) + " &bull; " + escapeHTML(line) + "</p>";
    }).join("");

    const section = document.createElement("div");
    section.innerHTML =
        "<h3>My rank and position</h3>" +
        "<p><strong>" + escapeHTML(RANK_NAME[data.ambassador_rank]) + "</strong>" + (data.region ? " &bull; " + escapeHTML(data.region) : "") + "</p>" +
        "<p class='meta'>School: " + escapeHTML(data.school || "none") +
        (data.assigned_schools.length ? " &bull; Also looking after: " + data.assigned_schools.map(function (s) { return escapeHTML(s.name); }).join(", ") : "") + "</p>" +
        "<p class='meta'>Monthly salary: " + (data.salary_kobo ? money(data.salary_kobo) : "to be approved") + "</p>" +
        "<p class='meta'>My performance: " + p.reviews + " review(s)" + (p.average_score != null ? ", average score " + p.average_score : "") +
        " &bull; signed up " + p.signed_up + " &bull; paid subscriptions " + p.paid_subscriptions + "</p>" +
        "<h3>My promotion history</h3>" + moves;
    box.appendChild(section);
}

async function showEarnings(box) {
    const { data, error } = await db.rpc("my_ambassador_earnings");
    if (error || !data) return;

    const link = "https://odi-king.github.io/Lagos-business-network/auth.html?ref=" + encodeURIComponent(data.referral_code || "");

    const stipends = (data.stipends || []).length === 0 ? "<p class='meta'>No stipends yet.</p>" : data.stipends.map(function (s) {
        return "<p class='meta'>" + escapeHTML(new Date(s.month).toLocaleDateString(undefined, { month: "long", year: "numeric" })) + " &bull; " + money(s.amount_kobo) +
            " &bull; <strong>" + escapeHTML(s.status) + "</strong>" + (s.note ? " &bull; " + escapeHTML(s.note) : "") + "</p>";
    }).join("");

    const section = document.createElement("div");
    section.innerHTML =
        "<h3>My referral link</h3>" +
        (data.referral_code ? "<p class='meta'>Code <strong>" + escapeHTML(data.referral_code) + "</strong>. You earn " + money(50000) + " when someone you invite pays for a yearly subscription.</p>" +
            '<input type="text" readonly value="' + escapeHTML(link) + '">' : "<p class='meta'>Open <a href='referrals.html'>Invite friends and earn</a> once to create your code.</p>") +
        "<h3>My earnings</h3>" +
        "<p class='meta'>Paid subscriptions you brought in: <strong>" + data.paid_subscriptions + "</strong> &bull; Commission on hold: " + money(data.commission_pending_kobo) +
        " &bull; Commission earned: " + money(data.commission_earned_kobo) + ". Withdraw commissions on <a href='referrals.html'>Invite friends and earn</a>.</p>" +
        "<h3>My monthly stipends</h3>" + stipends +
        "<h3>Where should we pay your stipend?</h3>" +
        (data.bank_name ? "<p class='meta'>Saved: " + escapeHTML(data.bank_name) + " ending " + escapeHTML(data.account_last4) + "</p>" : "<p class='meta'>No bank details saved yet.</p>") +
        '<form id="bankForm"><input type="text" id="bkBank" maxlength="60" placeholder="Bank name" required>' +
        '<input type="text" id="bkNumber" maxlength="10" inputmode="numeric" placeholder="Account number (10 digits)" required>' +
        '<input type="text" id="bkName" maxlength="80" placeholder="Account name" required>' +
        '<button type="submit" class="contact-btn">Save bank details</button></form>';

    box.appendChild(section);

    document.getElementById("bankForm").addEventListener("submit", async function (event) {
        event.preventDefault();
        say("");
        const res = await db.rpc("set_ambassador_bank", {
            p_bank: document.getElementById("bkBank").value,
            p_number: document.getElementById("bkNumber").value,
            p_name: document.getElementById("bkName").value
        });
        if (res.error) { say(res.error.message, "error"); return; }
        say("Bank details saved.", "ok");
        window.location.reload();
    });
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