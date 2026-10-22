
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
        showMessage("Supabase is not connected yet. Check supabase-config.js.", "error");
        payBtn.disabled = true;
        return;
    }

    const { data, error } = await db.auth.getSession();

    if (error) {
        showMessage("Unable to check your login. Please refresh and try again.", "error");
        payBtn.disabled = true;
        return;
    }

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    if (await hasActiveMembership(currentUser.id)) {
        window.location.href = "dashboard.html";
        return;
    }
}

async function waitForActivation() {
    payBtn.disabled = true;
    showMessage("Payment submitted. Checking membership activation...", "ok");

    for (let i = 0; i < 20; i++) {
        if (await hasActiveMembership(currentUser.id)) {
            window.location.href = "dashboard.html";
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    payBtn.disabled = false;
    showMessage(
        "Payment status is still being checked. Please do not pay again yet. Contact support if membership is not activated.",
        "error"
    );
}

payBtn.addEventListener("click", function () {
    if (!currentUser) {
        showMessage("Please log in and try again.", "error");
        return;
    }

    if (typeof PaystackPop === "undefined") {
        showMessage("Paystack could not load. Check your internet connection and refresh.", "error");
        return;
    }

    payBtn.disabled = true;

    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: currentUser.email,
        amount: PRICE_NAIRA * 100,
        currency: "NGN",
        ref: "LBN-" + Date.now() + "-" + Math.floor(Math.random() * 1000000),
        metadata: {
            user_id: currentUser.id
        },
        callback: function (response) {
            // A server must verify response.reference with Paystack
            // before activating membership.
            showMessage(
                "Payment reference received: " + response.reference +
                ". Waiting for secure payment verification.",
                "ok"
            );
            waitForActivation();
        },
        onClose: function () {
            payBtn.disabled = false;
            showMessage("Payment window closed. If you completed payment, check its status before trying again.");
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
