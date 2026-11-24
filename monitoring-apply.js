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

const ROLE = {
    head: "Head of Ambassador Monitoring",
    performance_officer: "Performance Monitoring Officer",
    field_officer: "Field Verification Officer",
    data_analyst: "Data and Fraud Analyst",
    member_verifier: "Member Verification Officer"
};
const ELIG = { graduate: "Qualified graduate", nysc: "NYSC member", professional: "Experienced professional", field_trained: "Trained field personnel" };

const msg = document.getElementById("mAppMsg");

function say(text, kind) { msg.textContent = text || ""; msg.className = "msg " + (kind || ""); }
function val(id) { return document.getElementById(id).value.trim(); }

async function init() {
    if (!db) return;
    const { data: sessionData } = await db.auth.getSession();

    if (!sessionData.session) {
        document.getElementById("mAppStatus").style.display = "";
        document.getElementById("mAppStatus").innerHTML = "<p><a class='contact-btn' href='auth.html?next=" + encodeURIComponent("monitoring-apply.html") + "'>Log in to apply</a></p>";
        return;
    }

    const status = await db.rpc("my_monitoring_status");
    if (status.error) { say("Applications open soon.", ""); return; }
    const s = status.data || {};
    const box = document.getElementById("mAppStatus");

    if (s.state === "staff") {
        box.style.display = "";
        box.innerHTML = "<h2>You are on the team</h2><p>" + escapeHTML(ROLE[s.role]) + " &bull; " + escapeHTML(s.staff_no) + "</p><p><a class='contact-btn' href='monitoring.html'>Open the Monitoring Department</a></p>";
        return;
    }
    if (s.state === "ambassador") {
        box.style.display = "";
        box.innerHTML = "<h2>Not available</h2><p>Ambassadors cannot join the Monitoring Department. It must stay independent of the ambassadors it checks.</p>";
        return;
    }
    if (s.state === "applied") {
        box.style.display = "";
        box.innerHTML = "<h2>Your application is in</h2><p>Status: " + (s.status === "reviewing" ? "under review" : "received") + ". We will tell you in your notifications.</p><button type='button' class='btn btn-outline' id='mWithdraw'>Withdraw my application</button>";
        document.getElementById("mWithdraw").addEventListener("click", async function () {
            if (!confirm("Withdraw your application?")) return;
            const r = await db.rpc("withdraw_monitoring_application");
            if (r.error) { say(r.error.message, "error"); return; }
            window.location.reload();
        });
        return;
    }
    document.getElementById("mAppFormBox").style.display = "";
}

document.getElementById("mAppForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    say("");
    const button = document.getElementById("mSubmit");
    button.disabled = true;
    const r = await db.rpc("submit_monitoring_application", {
        p_phone: val("mPhone"), p_role: val("mRole"), p_eligibility: val("mElig"), p_qualification: val("mQual"), p_experience: val("mExp"),
        p_location: val("mLoc"), p_why: val("mWhy"), p_referee_name: val("mRefName"), p_referee_contact: val("mRefContact")
    });
    button.disabled = false;
    if (r.error) { say(r.error.message, "error"); return; }
    document.getElementById("mAppFormBox").style.display = "none";
    say("Thank you. Your application was sent. Management will review it and tell you the result in your notifications.", "ok");
});

init();