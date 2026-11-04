// The Paystack public key lives in paystack-config.js
const PRICE_NAIRA = 20000;

const payBtn = document.getElementById("payBtn");
const payMessage = document.getElementById("payMessage");
let currentUser = null;
let startPaidUntil = null;

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

    const info = await getMembershipInfo();

    if (info) {
        if (info.is_admin || (info.active && !info.is_trial && info.days_left > 60)) {
            window.location.href = "dashboard.html";
            return;
        }

        startPaidUntil = info.paid_until;

        const end = info.paid_until
            ? new Date(info.paid_until).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
            : "";

        let text = "";

        if (info.active && info.is_trial) {
            text = "Your free trial ends on " + end + " (" + info.days_left + " days left). Paying now adds 12 months after it ends, so you lose nothing.";
        } else if (info.active) {
            text = "Your membership runs until " + end + ". Renewing adds 12 months after that date.";
        } else if (info.paid_until) {
            text = "Your membership ended on " + end + ". Pay to continue.";
        } else if (trialResult === "device_used") {
            text = "A free trial has already been used on this device, so please join with a yearly membership.";
        } else if (trialResult === "email_used") {
            text = "A free trial was already used with this email address, so please join with a yearly membership.";
        } else if (trialResult === "confirm_email") {
            text = "Confirm your email address to start your free month.";
        }

        const box = document.getElementById("memberStatus");
        if (text && box) {
            box.textContent = text;
            box.style.display = "block";
        }
    } else if (await hasActiveMembership(currentUser.id)) {
        // An older database without the free trial file
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
        const info = await getMembershipInfo();
        const done = info
            ? !!info.paid_until && (!startPaidUntil || new Date(info.paid_until) > new Date(startPaidUntil))
            : await hasActiveMembership(currentUser.id);

        if (done) {
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
        callback: function (response) {
            confirmPayment(response.reference).then(function () {
                waitForActivation();
            });
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