// Lagos Business Network customer care details
const SUPPORT_EMAIL = "ugbomeleonardo@gmail.com";
const SUPPORT_WHATSAPP = "2348027440442";
const SUPPORT_HOURS = ""; // Add your opening hours when ready

const supportForm = document.getElementById("supportForm");
const supBtn = document.getElementById("supBtn");
const supNote = document.getElementById("supMessageNote");

function showNote(text, type) {
    supNote.textContent = text;
    supNote.className = "msg " + (type || "");
}

function renderDetails() {
    const box = document.getElementById("contactDetails");
    const lines = [];

    if (SUPPORT_WHATSAPP) {
        lines.push(
            '<p><a class="contact-btn" target="_blank" rel="noopener" href="https://wa.me/' +
            encodeURIComponent(SUPPORT_WHATSAPP) +
            '">Chat with us on WhatsApp</a></p>'
        );
    }

    if (SUPPORT_EMAIL) {
        lines.push(
            '<p>Email: <a href="mailto:' +
            encodeURIComponent(SUPPORT_EMAIL) +
            '" style="color: var(--accent);">' +
            SUPPORT_EMAIL.replace(/[<>&"]/g, "") +
            '</a></p>'
        );
    }

    if (SUPPORT_WHATSAPP) {
        lines.push(
            '<p>Phone: <a href="tel:+2348027440442" style="color: var(--accent);">' +
            '08027440442</a></p>'
        );
    }

    if (SUPPORT_HOURS) {
        lines.push(
            '<p class="meta">Open: ' +
            SUPPORT_HOURS.replace(/[<>&"]/g, "") +
            '</p>'
        );
    }

    lines.push(
        '<p class="meta">Use the form below and we will reply to your email. ' +
        'LBN staff will never ask for your password, card number or OTP code.</p>'
    );

    box.innerHTML = lines.join("");
}

async function prefill() {
    if (!db) return;

    const { data, error } = await db.auth.getSession();

    if (error || !data.session) return;

    const user = data.session.user;

    document.getElementById("supEmail").value = user.email || "";

    document.getElementById("supName").value =
        (user.user_metadata && user.user_metadata.full_name) || "";
}

supportForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!db) {
        showNote(
            "Customer care is not connected yet. Please try again later.",
            "error"
        );
        return;
    }

    supBtn.disabled = true;
    showNote("Please wait...", "ok");

    try {
        const { error } = await db.rpc("send_support_message", {
            p_name: document.getElementById("supName").value.trim(),
            p_email: document.getElementById("supEmail").value.trim(),
            p_topic: document.getElementById("supTopic").value,
            p_message: document.getElementById("supMessage").value.trim(),
            p_trap: document.getElementById("supTrap").value
        });

        if (error) {
            showNote(
                "We could not send your message. Please try again later.",
                "error"
            );
            return;
        }

        showNote(
            "Thank you. Your message was sent and we will reply to your email.",
            "ok"
        );

        supportForm.reset();
        await prefill();

    } catch (error) {
        showNote(
            "Something went wrong. Please try again later.",
            "error"
        );
    } finally {
        supBtn.disabled = false;
    }
});

renderDetails();
prefill();
