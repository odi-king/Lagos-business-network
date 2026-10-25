// The Paystack public key lives in paystack-config.js
const PRICE_NAIRA = 20000;

const payBtn = document.getElementById("payBtn");
const payMessage = document.getElementById("payMessage");
let currentUser = null;

function showMessage(text, type) {
    payMessage.textContent = text;
    payMessage.className = "msg " + (type || "");
}

async function init() {
    if (!db) {
        showMessage("Supabase is not connected yet. Check supabase-config.js.", "error");
        payBtn.disabled = true;
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    if (await hasActiveMembership(currentUser.id)) {
        window.location.href = "dashboard.html";
        return;
    }

    if (membershipError) {
        showMessage("Could not check your membership: " + membershipError, "error");
    }
}

async function waitForActivation() {
    payBtn.disabled = true;
    showMessage("Payment received. Activating your membership...", "ok");

    for (let i = 0; i < 20; i++) {
        if (await hasActiveMembership(currentUser.id)) {
            window.location.href = "dashboard.html";
            return;
        }
        await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }

    payBtn.disabled = false;
    showMessage("We received your payment, but activation is taking longer than usual. Refresh this page in a minute.", "ok");
}

payBtn.addEventListener("click", function () {
    if (!currentUser) return;

    if (PAYSTACK_PUBLIC_KEY.startsWith("PASTE")) {
        showMessage("Add your Paystack public key at the top of pay.js first.", "error");
        return;
    }

    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: currentUser.email,
        amount: PRICE_NAIRA * 100, // Paystack counts in kobo
        currency: "NGN",
        ref: "LBN-" + Date.now() + "-" + Math.floor(Math.random() * 1000000),
        metadata: { user_id: currentUser.id },
        callback: function () {
            waitForActivation();
        },
        onClose: function () {
            showMessage("Payment window closed.");
        }
    });

    handler.openIframe();
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();