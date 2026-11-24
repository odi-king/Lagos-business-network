function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const TYPE = { business: "Business Owner Ambassador", student: "Student Ambassador", lecturer: "Lecturer Ambassador" };
const msg = document.getElementById("certMsg");

function d(value) {
    return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
}

async function init() {
    if (!db) { msg.textContent = "Not available right now."; return; }

    const no = (new URLSearchParams(window.location.search).get("no") || "").trim();
    let c = null;
    let verifying = false;

    if (no) {
        verifying = true;
        const { data, error } = await db.rpc("verify_ambassador_certificate", { p_no: no });
        if (error) { msg.textContent = "Could not check this certificate right now."; return; }
        if (!data || !data.valid) {
            document.getElementById("certTitle").textContent = "Certificate not found";
            msg.textContent = "We have no certificate with the number " + no.slice(0, 30) + ". Please check the number.";
            return;
        }
        c = data;
        c.certificate_no = no.toUpperCase();
    } else {
        const { data: sessionData } = await db.auth.getSession();
        if (!sessionData.session) {
            window.location.href = "auth.html?next=" + encodeURIComponent("ambassador-certificate.html");
            return;
        }
        const { data, error } = await db.rpc("my_ambassador_certificate");
        if (error) { msg.textContent = "Not set up yet. Run supabase-ambassadors-2.sql in Supabase."; return; }
        if (!data) { msg.textContent = "You do not have a certificate yet. It is issued when your appointment is confirmed."; return; }
        c = data;
    }

    const link = location.origin + location.pathname.replace(/[^/]*$/, "") + "ambassador-certificate.html?no=" + encodeURIComponent(c.certificate_no);
    const active = c.status === "confirmed" && (!c.appointment_end || new Date(c.appointment_end) > new Date());

    document.getElementById("certTitle").textContent = verifying ? "Certificate check" : "Ambassador certificate";

    const box = document.getElementById("certBox");
    box.style.display = "";
    box.innerHTML = `
        <div class="cert">
            <p class="meta">LAGOS BUSINESS NETWORK</p>
            <h2>Certificate of Appointment</h2>
            <p>This certifies that</p>
            <div class="big">${escapeHTML(c.name)}</div>
            <p>has been appointed <strong>${escapeHTML(TYPE[c.ambassador_type] || "Ambassador")}</strong>${c.school ? " for <strong>" + escapeHTML(c.school) + "</strong>" : ""}
            for the period <strong>${escapeHTML(d(c.appointment_start))}</strong> to <strong>${escapeHTML(d(c.appointment_end))}</strong>.</p>
            <p class="meta">Certificate number: <strong>${escapeHTML(c.certificate_no)}</strong></p>
            <p class="meta">Verify at: ${escapeHTML(link)}</p>
        </div>
        ${verifying || c.status !== "confirmed" ? '<p class="' + (active ? "msg ok" : "msg error") + '">' +
            (active ? "This certificate is genuine and the appointment is current." :
             "This certificate is genuine. The appointment status is: " + escapeHTML(c.status) + ".") + "</p>" : ""}
    `;

    if (!verifying) document.getElementById("printBtn").style.display = "";
}

document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

const logoutLink = document.getElementById("logoutBtn");
if (logoutLink) logoutLink.addEventListener("click", async function (e) { e.preventDefault(); if (db) await db.auth.signOut(); window.location.href = "auth.html"; });

init();