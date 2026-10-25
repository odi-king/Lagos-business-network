let people = [];

const peopleList = document.getElementById("peopleList");
const adminSearch = document.getElementById("adminSearch");
const adminFilter = document.getElementById("adminFilter");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function isPaid(person) {
    return !!person.paid_until && new Date(person.paid_until) > new Date();
}

async function init() {
    if (!db) {
        peopleList.innerHTML = "<p>Supabase is not connected yet. Check supabase-config.js.</p>";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    const me = await db
        .from("profiles")
        .select("is_admin")
        .eq("id", data.session.user.id)
        .maybeSingle();

    if (!me.data || !me.data.is_admin) {
        document.querySelector("main").innerHTML = `
            <section class="panel">
                <h2>Admins only</h2>
                <p class="meta">This page is only for the site owner.</p>
                <a href="dashboard.html" class="btn btn-primary" style="margin-top:10px;">Back to dashboard</a>
            </section>`;
        return;
    }

    await Promise.all([loadPeople(), loadSupport(), loadQueue(), loadSettings()]);
}

async function loadPeople() {
    const { data, error } = await db.rpc("admin_people");

    if (error) {
        peopleList.innerHTML = "<p>Could not load people. " + escapeHTML(error.message) + "</p>";
        return;
    }

    people = data;
    renderStats();
    renderPeople();
}

function renderStats() {
    const waiting = people.filter(function (p) { return p.role === "lecturer" && !p.approved; }).length;
    const paid = people.filter(isPaid).length;
    const graduates = people.filter(function (p) { return p.role === "student" && p.graduated; }).length;

    const items = [
        { label: "Members", value: people.length },
        { label: "Paid members", value: paid },
        { label: "Lecturers waiting", value: waiting },
        { label: "Graduates", value: graduates }
    ];

    document.getElementById("adminStats").innerHTML = items.map(function (item) {
        return '<div class="card"><div class="stat">' + item.value + '</div><p>' + item.label + '</p></div>';
    }).join("");
}

function renderPeople() {
    const search = adminSearch.value.toLowerCase();
    const filter = adminFilter.value;

    const visible = people.filter(function (p) {
        const text = [p.full_name, p.email, p.institution].join(" ").toLowerCase();
        if (!text.includes(search)) return false;

        if (filter === "waiting") return p.role === "lecturer" && !p.approved;
        if (filter === "lecturers") return p.role === "lecturer";
        if (filter === "students") return p.role === "student";
        if (filter === "graduates") return p.role === "student" && p.graduated;
        if (filter === "unpaid") return !isPaid(p);
        return true;
    });

    if (visible.length === 0) {
        peopleList.innerHTML = "<p class='meta'>Nobody here.</p>";
        return;
    }

    peopleList.innerHTML = "";

    visible.forEach(function (p) {
        const card = document.createElement("div");
        card.className = "business-card";

        const isLecturer = p.role === "lecturer";
        const statusBadge = p.is_admin
            ? "\u2605 Administrator"
            : isLecturer
                ? (p.approved ? "\u2713 Verified lecturer" : "Waiting for approval")
                : (p.verified ? "\u2713 Verified trader" : (p.graduated ? "Graduate" : "Student"));
        const badgeClass = p.is_admin ? "admin" : isLecturer ? "lecturer" : p.verified ? "trader" : "";

        const verifyButton = (!isLecturer && !p.is_admin)
            ? (p.verified
                ? '<button type="button" class="delete-btn" data-action="unverify" data-id="' + escapeHTML(p.id) + '">Remove verified</button>'
                : '<button type="button" class="btn btn-outline" data-action="verify" data-id="' + escapeHTML(p.id) + '">Make verified trader</button>')
            : "";

        const roleButton = isLecturer
            ? (p.approved
                ? '<button type="button" class="delete-btn" data-action="unapprove" data-id="' + escapeHTML(p.id) + '">Remove approval</button>'
                : '<button type="button" class="contact-btn" data-action="approve" data-id="' + escapeHTML(p.id) + '">Approve lecturer</button>')
            : (p.graduated
                ? '<button type="button" class="delete-btn" data-action="ungraduate" data-id="' + escapeHTML(p.id) + '">Undo graduation</button>'
                : '<button type="button" class="contact-btn" data-action="graduate" data-id="' + escapeHTML(p.id) + '">Graduate student</button>');

        const paidText = isPaid(p)
            ? "Paid until " + new Date(p.paid_until).toLocaleDateString()
            : "Not paid";

        card.innerHTML = `
            <h3>${escapeHTML(p.full_name || "No name")}
                <span class="badge ${badgeClass}">${statusBadge}</span>
            </h3>
            <p class="meta">${escapeHTML(p.email)}</p>
            ${p.institution ? '<p class="meta">School: ' + escapeHTML(p.institution) + "</p>" : ""}
            <p class="meta">Joined ${new Date(p.created_at).toLocaleDateString()} &bull; ${paidText}</p>
            ${roleButton}
            ${verifyButton}
            <button type="button" class="btn btn-outline" data-action="grant" data-id="${escapeHTML(p.id)}">Give 1 year access</button>
        `;

        peopleList.appendChild(card);
    });
}

peopleList.addEventListener("click", async function (event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    const person = people.find(function (p) { return p.id === id; });
    const name = person ? (person.full_name || person.email) : "this person";

    const messages = {
        approve: "Approve " + name + " as a verified lecturer?",
        unapprove: "Remove " + name + "'s lecturer approval?",
        graduate: "Graduate " + name + " and open the marketplace for them?",
        ungraduate: "Undo graduation for " + name + "?",
        verify: "Make " + name + " a verified trader (blue tick)?",
        unverify: "Remove " + name + "'s verified trader badge?",
        grant: "Give " + name + " one year of free membership?"
    };

    if (!confirm(messages[action])) return;

    button.disabled = true;
    let result;

    if (action === "approve") result = await db.rpc("admin_set_flags", { target: id, set_approved: true });
    if (action === "unapprove") result = await db.rpc("admin_set_flags", { target: id, set_approved: false });
    if (action === "graduate") result = await db.rpc("admin_set_flags", { target: id, set_graduated: true });
    if (action === "ungraduate") result = await db.rpc("admin_set_flags", { target: id, set_graduated: false });
    if (action === "verify") result = await db.rpc("admin_set_flags", { target: id, set_verified: true });
    if (action === "unverify") result = await db.rpc("admin_set_flags", { target: id, set_verified: false });
    if (action === "grant") result = await db.rpc("admin_grant_membership", { target: id, add_days: 365 });

    if (result && result.error) {
        alert("Could not do that: " + result.error.message);
        button.disabled = false;
        return;
    }

    await loadPeople();
});

adminSearch.addEventListener("input", renderPeople);
adminFilter.addEventListener("change", renderPeople);

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

// ---------- Customer care messages ----------

let supportMessages = [];

const supportList = document.getElementById("supportList");
const supportFilter = document.getElementById("supportFilter");

async function loadSupport() {
    const { data, error } = await db.rpc("admin_support_messages");

    if (error) {
        supportList.innerHTML = "<p>Could not load messages. " + escapeHTML(error.message) + "</p>";
        return;
    }

    supportMessages = data;
    renderSupport();
}

function renderSupport() {
    const filter = supportFilter.value;

    const visible = supportMessages.filter(function (m) {
        if (filter === "open") return !m.resolved;
        if (filter === "resolved") return m.resolved;
        return true;
    });

    if (visible.length === 0) {
        supportList.innerHTML = "<p class='meta'>No messages here.</p>";
        return;
    }

    supportList.innerHTML = "";

    visible.forEach(function (m) {
        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${escapeHTML(m.topic)}
                <span class="badge ${m.resolved ? "lecturer" : "admin"}">${m.resolved ? "Resolved" : "Open"}</span>
            </h3>
            <p class="meta">${escapeHTML(m.name)} &bull; <a href="mailto:${escapeHTML(m.email)}" style="color: var(--accent);">${escapeHTML(m.email)}</a> &bull; ${new Date(m.created_at).toLocaleString()}</p>
            <p style="white-space: pre-wrap;">${escapeHTML(m.message)}</p>
            <button type="button" class="${m.resolved ? "btn btn-outline" : "contact-btn"}" data-support-id="${escapeHTML(m.id)}" data-resolved="${m.resolved ? "false" : "true"}">
                ${m.resolved ? "Reopen" : "Mark as resolved"}
            </button>
        `;

        supportList.appendChild(card);
    });
}

supportList.addEventListener("click", async function (event) {
    const button = event.target.closest("button[data-support-id]");
    if (!button) return;

    button.disabled = true;

    const { error } = await db.rpc("admin_resolve_support", {
        p_id: button.dataset.supportId,
        p_resolved: button.dataset.resolved === "true"
    });

    if (error) {
        alert("Could not update it: " + error.message);
        button.disabled = false;
        return;
    }

    await loadSupport();
});

supportFilter.addEventListener("change", renderSupport);

// ---------- Payments and disputes ----------

let queue = [];

const queueList = document.getElementById("queueList");
const queueFilter = document.getElementById("queueFilter");

const KIND_LABELS = {
    dispute: "Dispute: money on hold",
    payout_due: "Pay the seller",
    refund_due: "Refund the buyer",
    awaiting_confirmation: "Waiting for the buyer",
    unmatched_payment: "Payment did not match a trade"
};

function money(amount) {
    return "\u20A6" + Number(amount || 0).toLocaleString();
}

async function loadQueue() {
    const { data, error } = await db.rpc("admin_payment_queue");

    if (error) {
        queueList.innerHTML = "<p>Could not load payments. " + escapeHTML(error.message) + "</p>";
        return;
    }

    queue = data;
    renderQueue();
}

function renderQueue() {
    const filter = queueFilter.value;
    const actionKinds = ["dispute", "payout_due", "refund_due", "unmatched_payment"];

    const visible = queue.filter(function (row) {
        if (filter === "all") return true;
        if (filter === "action") return actionKinds.includes(row.kind);
        return row.kind === filter;
    });

    if (visible.length === 0) {
        queueList.innerHTML = "<p class='meta'>Nothing here.</p>";
        return;
    }

    queueList.innerHTML = "";

    visible.forEach(function (row) {
        const card = document.createElement("div");
        card.className = "business-card";

        const id = escapeHTML(row.trade_id || "");
        const chat = row.trade_id
            ? '<a class="btn btn-outline" style="margin:10px 8px 0 0;" href="trade.html?id=' + encodeURIComponent(row.trade_id) + '">Open chat</a>'
            : "";

        let details = "";
        let buttons = "";

        if (row.kind === "dispute") {
            details = "<p><strong>Reason:</strong> " + escapeHTML(row.reason) + "</p>";
            buttons =
                '<button type="button" class="contact-btn" data-act="release" data-trade="' + id + '">Release to seller</button>' +
                '<button type="button" class="delete-btn" data-act="refund" data-trade="' + id + '">Refund buyer</button>';
        } else if (row.kind === "payout_due") {
            details =
                "<p><strong>Pay the seller " + money(row.seller_amount) + "</strong> (LBN fee " + money(row.fee_amount) + ")</p>" +
                (row.account_number
                    ? "<p>" + escapeHTML(row.bank_name) + " &bull; " + escapeHTML(row.account_number) + " &bull; " + escapeHTML(row.account_name) + "</p>"
                    : "<p class='meta'>The seller has not saved a payout account yet. Ask them to add one on their dashboard.</p>");
            buttons = '<button type="button" class="contact-btn" data-act="paidout" data-trade="' + id + '">Mark as paid out</button>';
        } else if (row.kind === "refund_due") {
            details =
                "<p><strong>Refund the buyer " + money(row.amount) + "</strong> through your Paystack dashboard.</p>" +
                "<p class='meta'>Payment reference: " + escapeHTML(row.reference) + "</p>";
            buttons = '<button type="button" class="contact-btn" data-act="refunded" data-trade="' + id + '">Mark as refunded</button>';
        } else if (row.kind === "unmatched_payment") {
            details =
                "<p><strong>" + money(row.amount) + "</strong> was paid but did not match a trade. " + escapeHTML(row.reason) + "</p>" +
                "<p class='meta'>Payment reference: " + escapeHTML(row.reference) + ". Refund it in Paystack, then mark it done.</p>";
            buttons = '<button type="button" class="contact-btn" data-act="unmatched" data-ref="' + escapeHTML(row.reference) + '">Mark as handled</button>';
        } else {
            details = "<p class='meta'>Held: " + money(row.amount) + ". Waiting for the buyer to confirm.</p>";
        }

        card.innerHTML = `
            <h3>${escapeHTML(row.business_name || "Payment")}
                <span class="badge admin">${KIND_LABELS[row.kind] || row.kind}</span>
            </h3>
            <p class="meta">${row.buyer_name ? "Buyer " + escapeHTML(row.buyer_name) + " &bull; Seller " + escapeHTML(row.seller_name || "") + " &bull; " : ""}${new Date(row.since).toLocaleString()}</p>
            ${details}
            ${chat}
            ${buttons}
        `;

        queueList.appendChild(card);
    });
}

queueList.addEventListener("click", async function (event) {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    const act = button.dataset.act;
    let result;

    if (act === "release" || act === "refund") {
        const question = act === "release"
            ? "Release the money to the seller? This closes the trade."
            : "Refund the buyer? This closes the trade.";
        if (!confirm(question)) return;

        const note = prompt("Write a short note about why you decided this (only you can see it):") || "";
        button.disabled = true;
        result = await db.rpc("admin_resolve_dispute", { p_trade_id: button.dataset.trade, p_decision: act, p_note: note });
    } else if (act === "paidout") {
        if (!confirm("Mark as paid out? Do this only after you sent the money to the seller's bank account.")) return;
        button.disabled = true;
        result = await db.rpc("admin_mark_paid_out", { p_trade_id: button.dataset.trade });
    } else if (act === "refunded") {
        if (!confirm("Mark as refunded? Do this only after you refunded the buyer in Paystack.")) return;
        button.disabled = true;
        result = await db.rpc("admin_mark_refunded", { p_trade_id: button.dataset.trade });
    } else if (act === "unmatched") {
        if (!confirm("Mark this payment as handled?")) return;
        button.disabled = true;
        result = await db.rpc("admin_resolve_unmatched", { p_reference: button.dataset.ref });
    }

    if (result && result.error) {
        alert("Could not do that: " + result.error.message);
        button.disabled = false;
        return;
    }

    await loadQueue();
});

queueFilter.addEventListener("change", renderQueue);

// ---------- Payment settings ----------

let paymentsOn = false;

async function loadSettings() {
    const { data, error } = await db.rpc("admin_get_settings");
    const message = document.getElementById("settingsMsg");

    if (error) {
        message.className = "msg error";
        message.textContent = "Could not load settings. " + error.message;
        return;
    }

    const settings = {};
    data.forEach(function (row) { settings[row.key] = row.value; });

    paymentsOn = settings.payments_enabled === "true";

    document.getElementById("paymentsStatus").textContent = paymentsOn
        ? "Trade payments are ON. Buyers can pay inside trades."
        : "Trade payments are OFF. Nobody can pay inside trades yet.";
    document.getElementById("paymentsToggle").textContent = paymentsOn ? "Turn payments off" : "Turn payments on";

    document.getElementById("feePercent").value = settings.fee_percent || "";
    document.getElementById("feePercentVerified").value = settings.fee_percent_verified || "";
    document.getElementById("minFee").value = settings.min_fee || "";
}

document.getElementById("paymentsToggle").addEventListener("click", async function () {
    const turningOn = !paymentsOn;

    if (turningOn && !confirm("Turn ON real trade payments? Only do this after Paystack and your lawyer have approved it, and your live Paystack keys are in place.")) {
        return;
    }

    const { error } = await db.rpc("admin_set_setting", {
        p_key: "payments_enabled",
        p_value: turningOn ? "true" : "false"
    });

    if (error) {
        alert("Could not change it: " + error.message);
        return;
    }

    await loadSettings();
});

document.getElementById("feeForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const message = document.getElementById("settingsMsg");
    const pairs = [
        ["fee_percent", document.getElementById("feePercent").value],
        ["fee_percent_verified", document.getElementById("feePercentVerified").value],
        ["min_fee", document.getElementById("minFee").value]
    ];

    for (const pair of pairs) {
        const { error } = await db.rpc("admin_set_setting", { p_key: pair[0], p_value: String(pair[1]) });

        if (error) {
            message.className = "msg error";
            message.textContent = error.message;
            return;
        }
    }

    message.className = "msg ok";
    message.textContent = "Fees saved.";
    await loadSettings();
});

init();