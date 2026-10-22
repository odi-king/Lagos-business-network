// Paystack PUBLIC test key
// Never put your Paystack secret key in website JavaScript.
const PAYSTACK_PUBLIC_KEY = "pk_test_e40b34f200a74d585aacfe9826480ec8f096722c";
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
        showMessage(
            "Supabase is not connected. Check supabase-config.js.",
            "error"
        );
        payBtn.disabled = true;
        return;
    }

    const { data, error } = await db.auth.getSession();

    if (error) {
        showMessage("Could not check your login: " + error.message, "error");
        return;
    }

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    const active = await hasActiveMembership(currentUser.id);

    if (active) {
        window.location.href = "dashboard.html";
        return;
    }

    if (membershipError) {
        showMessage(
            "Membership check: " + membershipError,
            "error"
        );
    }
}

async function waitForActivation() {
    payBtn.disabled = true;
    showMessage("Payment received. Checking membership activation...", "ok");

    for (let i = 0; i < 20; i++) {
        if (await hasActiveMembership(currentUser.id)) {
            window.location.href = "dashboard.html";
            return;
        }

        await new Promise(function (resolve) {
            setTimeout(resolve, 2000);
        });
    }

    payBtn.disabled = false;
    showMessage(
        "Payment was submitted, but membership is not active yet. Check your Paystack transaction and webhook configuration before paying again.",
        "error"
    );
}

payBtn.addEventListener("click", function () {
    if (!currentUser) {
        showMessage("Please log in first.", "error");
        return;
    }

    if (typeof PaystackPop === "undefined") {
        showMessage("Paystack did not load. Refresh and try again.", "error");
        return;
    }

    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: currentUser.email,
        amount: PRICE_NAIRA * 100,
        currency: "NGN",
        ref: "LBN-" + Date.now() + "-" +
            Math.floor(Math.random() * 1000000),
        metadata: {
            user_id: currentUser.id
        },
        callback: function () {
            waitForActivation();
        },
        onClose: function () {
            showMessage("Payment window closed.");
        }
    });

    handler.openIframe();
});

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async function (event) {
        event.preventDefault();

        if (db) {
            await db.auth.signOut();
        }

        window.location.href = "auth.html";
    });
}

init();
