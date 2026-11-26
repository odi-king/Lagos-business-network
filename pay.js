// The Paystack public key lives in paystack-config.js

let planButtons = [];
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
            text = "Your free trial ends on " + end + " (" + info.days_left + " days left). Paying now adds your plan after it ends, so you lose nothing.";
        } else if (info.active) {
            text = "Your membership runs until " + end + ". Renewing adds time after that date.";
        } else if (info.paid_until) {
            text = "Your membership ended on " + end + ". Pay to continue.";
        } else if (trialResult === "device_used") {
            text = "A free trial has already been used on this device, so please join with a paid plan.";
        } else if (trialResult === "email_used") {
            text = "A free trial was already used with this email address, so please join with a paid plan.";
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
    planButtons.forEach(function (b) { b.disabled = true; });
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

    planButtons.forEach(function (b) { b.disabled = false; });
    showMessage("We received your payment, but activation is taking longer than usual. Refresh this page in a minute.", "ok");
}

const PERIOD = { week: "per week", month: "per month", year: "per year" };

function money(currency, minor) {
    const v = Number(minor) / 100;
    return (currency === "USD" ? "$" : "\u20A6") + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function loadPlans() {
    const box = document.getElementById("planList");
    const { data, error } = await db.rpc("plans_for_me");

    if (error || !data) {
        // The plans file has not been run yet: keep the old yearly payment working
        box.innerHTML = '<button type="button" class="contact-btn" id="legacyBtn">Pay \u20A620,000 for one year</button>';
        document.getElementById("legacyBtn").addEventListener("click", function () { startPay({ plan: null, currency: "NGN", amount_minor: 2000000 }); });
        return;
    }

    if (!data.region) {
        box.innerHTML = '<p class="notice">Please tell us your country first, so we show the right prices. <a href="my-location.html?next=pay.html" style="color: var(--accent);">Add my location</a></p>';
        return;
    }

    if (!data.plans.length) {
        box.innerHTML = '<p class="meta">No plans are available right now.</p>';
        return;
    }

    box.innerHTML = "";
    planButtons = [];

    data.plans.forEach(function (p) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "contact-btn";
        b.style.cssText = "display:block;width:100%;margin:8px 0;";
        b.textContent = money(p.currency, p.amount_minor) + " " + PERIOD[p.period];
        b.disabled = !data.can_pay;
        b.addEventListener("click", function () { startPay(p); });
        box.appendChild(b);
        planButtons.push(b);
    });

    if (!data.can_pay) {
        const n = document.createElement("p");
        n.className = "notice";
        n.textContent = "Payments from your country are not open yet. We will tell you as soon as they are.";
        box.appendChild(n);
    }
}

async function startPay(p) {
    if (!currentUser) return;

    if (PAYSTACK_PUBLIC_KEY.startsWith("PASTE")) {
        showMessage("Add your Paystack public key at the top of pay.js first.", "error");
        return;
    }

    // The server confirms the plan belongs to this member's country before the payment window opens
    if (p.plan !== null) {
        const chk = await db.rpc("plan_checkout_start", { p_plan: p.code });

        if (chk.error || !chk.data || chk.data.ok === false) {
            showMessage(chk.error ? chk.error.message : (chk.data && chk.data.message) || "Could not start the payment", "error");
            return;
        }

        if (chk.data.provider !== "paystack") {
            showMessage("This payment method is not connected yet.", "error");
            return;
        }
    }

    const meta = { user_id: currentUser.id };
    if (p.plan !== null) meta.plan = p.code;

    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: currentUser.email,
        amount: p.amount_minor, // kobo for naira, cents for dollars
        currency: p.currency,
        ref: "LBN-" + Date.now() + "-" + Math.floor(Math.random() * 1000000),
        metadata: meta,
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
}

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init().then(loadPlans);