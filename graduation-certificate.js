// LBN Phase 7F: the graduation certificate (your own, printable) and the public check (?no=NUMBER).
// Works with supabase-certificates.sql.

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

        const { data, error } = await db.rpc("verify_graduation_certificate", { p_no: no });

        if (error) { msg.textContent = "Could not check this certificate right now."; return; }

        if (!data || !data.valid) {
            document.getElementById("certTitle").textContent = "Certificate not found";
            msg.className = "msg error no-print";
            msg.textContent = "We have no certificate with the number " + no.slice(0, 30) + ". Please check the number.";
            return;
        }

        c = data;
        c.certificate_no = no.toUpperCase();
    } else {
        const { data: sessionData } = await db.auth.getSession();

        if (!sessionData.session) {
            window.location.href = "auth.html?next=" + encodeURIComponent("graduation-certificate.html");
            return;
        }

        const { data, error } = await db.rpc("my_graduation_certificate");

        if (error) { msg.textContent = "Not set up yet. Run supabase-certificates.sql in Supabase."; return; }
        if (!data) { msg.textContent = "You do not have a certificate yet. It is issued when the LBN team approves your graduation."; return; }

        c = data;
    }

    const link = location.origin + location.pathname.replace(/[^/]*$/, "") + "graduation-certificate.html?no=" + encodeURIComponent(c.certificate_no);
    const valid = c.status === "valid";

    document.getElementById("certTitle").textContent = verifying ? "Certificate check" : "Graduation certificate";

    const box = document.getElementById("certBox");
    box.style.display = "";
    box.innerHTML = `
        <div class="cert">
            <p class="meta">LAGOS BUSINESS NETWORK</p>
            <h2>Certificate of Graduation</h2>
            <p>This certifies that</p>
            <div class="big">${escapeHTML(c.name)}</div>
            <p>has successfully completed the Lagos Business Network learning programme and graduated on <strong>${escapeHTML(d(c.issued_at))}</strong>.</p>
            <p class="meta">Certificate number: <strong>${escapeHTML(c.certificate_no)}</strong></p>
            <p class="meta">Verify at: ${escapeHTML(link)}</p>
        </div>
        ${verifying || !valid ? '<p class="' + (valid ? "msg ok" : "msg error") + '">' +
            (valid ? "This certificate is genuine." : "This certificate was withdrawn by Lagos Business Network and is no longer valid.") + "</p>" : ""}
    `;

    if (!verifying) document.getElementById("printBtn").style.display = "";
}

document.getElementById("printBtn").addEventListener("click", function () { window.print(); });

init();