function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const SITE = "https://odi-king.github.io/Lagos-business-network/";

function naira(kobo) {
    return "₦" + (Number(kobo || 0) / 100).toLocaleString();
}

const STATE_LABEL = {
    trial: "Signed up, on free trial",
    hold: "Subscribed, bonus on hold",
    earned: "Bonus earned",
    review: "Being checked by our team",
    void: "Not counted"
};

const PAYOUT_LABEL = {
    requested: "Waiting",
    approved: "Approved, paid in the next monthly payment",
    paid: "Paid",
    rejected: "Not approved"
};

const refMsg = document.getElementById("refMsg");

function say(text, kind) {
    refMsg.textContent = text || "";
    refMsg.className = "msg " + (kind || "");
}

async function init() {
    const body = document.getElementById("refBody");

    if (!db) {
        body.innerHTML = "<section class='panel'><p class='meta'>Supabase is not connected yet.</p></section>";
        return;
    }

    const { data: sessionData } = await db.auth.getSession();

    if (!sessionData.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("referrals.html");
        return;
    }

    const { data, error } = await db.rpc("my_referral_dashboard");

    if (error) {
        body.innerHTML = "<section class='panel'><p class='meta'>Not set up yet. Run supabase-referrals.sql in Supabase.</p></section>";
        return;
    }

    render(data);
}

function render(d) {
    const link = SITE + "auth.html?ref=" + encodeURIComponent(d.code);
    document.getElementById("rewardText").textContent = naira(d.reward_kobo);

    const canWithdraw = d.balance_kobo >= d.min_payout_kobo;
    const open = (d.payouts || []).some(function (p) { return p.status === "requested" || p.status === "approved"; });

    const history = (d.history || []).length === 0
        ? "<p class='meta'>No one has joined with your link yet.</p>"
        : d.history.map(function (r) {
            return '<div class="staff-card"><strong>' + escapeHTML(r.who) + "</strong>" +
                '<div class="meta">' + escapeHTML(STATE_LABEL[r.state] || r.state) +
                " &bull; " + escapeHTML(new Date(r.created_at).toLocaleDateString()) +
                (r.state === "hold" && r.hold_until ? " &bull; available " + escapeHTML(new Date(r.hold_until).toLocaleDateString()) : "") +
                (r.reward_kobo ? " &bull; " + naira(r.reward_kobo) : "") + "</div></div>";
        }).join("");

    const payouts = (d.payouts || []).length === 0
        ? "<p class='meta'>No withdrawals yet.</p>"
        : d.payouts.map(function (p) {
            return '<div class="staff-card"><strong>' + naira(p.amount_kobo) + "</strong>" +
                '<div class="meta">' + escapeHTML(PAYOUT_LABEL[p.status] || p.status) + " &bull; " +
                escapeHTML(new Date(p.requested_at).toLocaleDateString()) + " &bull; " + escapeHTML(p.bank_name) +
                (p.payment_note ? " &bull; " + escapeHTML(p.payment_note) : "") + "</div></div>";
        }).join("");

    document.getElementById("refBody").innerHTML = `
        <section class="panel">
            <h2>Your link</h2>
            <p class="meta">Your code: <strong>${escapeHTML(d.code)}</strong></p>
            <input type="text" id="refLink" value="${escapeHTML(link)}" readonly>
            <div class="staff-actions">
                <button type="button" class="contact-btn" id="shareBtn">Share with a Friend</button>
                <button type="button" class="btn btn-outline" id="copyBtn">Copy link</button>
            </div>
        </section>

        <section class="panel">
            <h2>My Earnings</h2>
            <div class="stat">${naira(d.balance_kobo)} <span class="meta">available to withdraw</span></div>
            <p class="meta">Bonus on hold: ${naira(d.bonus_pending_kobo)} (each bonus is held for ${escapeHTML(d.hold_days)} days) &bull; Waiting for payment: ${naira(d.waiting_payout_kobo)} &bull; Already paid: ${naira(d.paid_kobo)}</p>
        </section>

        <section class="panel">
            <h2>How it is going</h2>
            <div class="grid cols-2">
                <div class="card"><div class="meta">Signed up</div><strong>${d.signed_up}</strong></div>
                <div class="card"><div class="meta">On free trial</div><strong>${d.on_trial}</strong></div>
                <div class="card"><div class="meta">Subscribed</div><strong>${d.subscribed}</strong></div>
                <div class="card"><div class="meta">Total bonus earned</div><strong>${naira(d.bonus_earned_kobo + d.bonus_pending_kobo)}</strong></div>
            </div>
            <p class="meta">You earn only when a friend pays for a yearly subscription. Free trials do not earn a bonus. For privacy we show only first names.</p>
        </section>

        <section class="panel">
            <h2>Withdraw</h2>
            <p class="meta">Minimum ${naira(d.min_payout_kobo)}. Payments are made once a month by bank transfer.</p>
            ${open ? "<p class='notice'>You already have a withdrawal waiting.</p>" : canWithdraw ? `
            <form id="payoutForm">
                <label class="meta" for="pBank">Bank name</label>
                <input type="text" id="pBank" maxlength="60" required>
                <label class="meta" for="pNumber">Account number (10 digits)</label>
                <input type="text" id="pNumber" inputmode="numeric" maxlength="10" required>
                <label class="meta" for="pName">Account name</label>
                <input type="text" id="pName" maxlength="80" required>
                <button type="submit" class="contact-btn">Withdraw ${naira(d.balance_kobo)}</button>
            </form>` : "<p class='meta'>You can withdraw once your available balance reaches the minimum.</p>"}
            <h3>My withdrawals</h3>
            ${payouts}
        </section>

        <section class="panel">
            <h2>People I invited</h2>
            ${history}
        </section>
    `;

    const input = document.getElementById("refLink");
    const text = "Join me on Lagos Business Network and get your first month free: " + link;

    document.getElementById("copyBtn").addEventListener("click", async function () {
        try {
            await navigator.clipboard.writeText(link);
        } catch (e) {
            input.select();
            document.execCommand("copy");
        }
        say("Link copied.", "ok");
    });

    document.getElementById("shareBtn").addEventListener("click", async function () {
        if (navigator.share) {
            try {
                await navigator.share({ title: "Lagos Business Network", text: text, url: link });
            } catch (e) {}
        } else {
            window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
        }
    });

    const form = document.getElementById("payoutForm");

    if (form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            say("");

            const { error } = await db.rpc("request_payout", {
                p_bank: document.getElementById("pBank").value,
                p_account_number: document.getElementById("pNumber").value,
                p_account_name: document.getElementById("pName").value
            });

            if (error) {
                say(error.message, "error");
                return;
            }

            say("Withdrawal requested. It will be paid in the next monthly payment.", "ok");
            await init();
        });
    }
}

init();