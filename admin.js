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
    if (typeof requireAal2 === "function" && !(await requireAal2())) return;

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

    // What is this admin allowed to do?
    const accessResult = await db.rpc("my_admin_access");
    const row = accessResult.data && accessResult.data[0];

    // If the admin team file has not been run yet, everyone who was an admin keeps full access
    const access = accessResult.error || !row
        ? { is_super: true, title: "Admin", permissions: [] }
        : row;

    function can(permission) {
        return access.is_super || access.permissions.indexOf(permission) !== -1;
    }

    document.querySelectorAll("[data-perm]").forEach(function (box) {
        const allowed = box.dataset.perm.split(",").some(can);
        if (!allowed) box.style.display = "none";
    });

    document.getElementById("adminNote").textContent =
        "Signed in as " + (access.title || "Admin") + ". " +
        (access.is_super ? "You have full control of the platform." : "You see only what your role allows.");

    if (access.is_super && !accessResult.error) {
        const profileLink = document.querySelector('.nav-links a[href="member.html"]');
        if (profileLink) profileLink.insertAdjacentHTML("beforebegin", '<a href="admins.html">Admin team</a>');

        document.getElementById("adminNote").insertAdjacentHTML("afterend",
            '<a href="admins.html" class="btn btn-outline" style="margin-top:10px;">Manage the admin team</a>');
    }

    const jobs = [];
    if (can("members")) {
        jobs.push(loadPeople());
        jobs.push(loadTrialFlags());
    }
    if (can("support")) jobs.push(loadSupport());
    if (can("marketplace") || can("content")) jobs.push(loadReviewReports());
    if (can("finance") || can("marketplace")) jobs.push(loadQueue());
    if (can("finance")) {
        jobs.push(loadSettings());
        jobs.push(loadReadiness());
    }
    if (can("education")) {
        jobs.push(loadGradRequests());
        jobs.push(loadGradRules());
    }

    await Promise.all(jobs);
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
    const waiting = people.filter(function (p) { return (p.role === "lecturer" || p.role === "business") && !p.approved; }).length;
    const paid = people.filter(isPaid).length;
    const graduates = people.filter(function (p) { return p.role === "student" && p.graduated; }).length;

    const items = [
        { label: "Members", value: people.length },
        { label: "Paid members", value: paid },
        { label: "Waiting for approval", value: waiting },
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

        if (filter === "waiting") return (p.role === "lecturer" || p.role === "business") && !p.approved;
        if (filter === "businesses") return p.role === "business";
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

        const isLecturer = p.role === "lecturer" || p.role === "business";
        const statusBadge = p.is_admin
            ? "\u2605 Administrator"
            : isLecturer
                ? (p.approved ? (p.role === "business" ? "\u2713 Verified business" : "\u2713 Verified lecturer") : "Waiting for approval")
                : (p.verified ? "\u2713 Verified trader" : (p.graduated ? "Graduate" : "Student"));
        const badgeClass = p.is_admin ? "admin" : p.role === "business" ? "business" : isLecturer ? "lecturer" : p.verified ? "trader" : "";

        const verifyButton = (!isLecturer && !p.is_admin)
            ? (p.verified
                ? '<button type="button" class="delete-btn" data-action="unverify" data-id="' + escapeHTML(p.id) + '">Remove verified</button>'
                : '<button type="button" class="btn btn-outline" data-action="verify" data-id="' + escapeHTML(p.id) + '">Make verified trader</button>')
            : "";

        const roleButton = isLecturer
            ? (p.approved
                ? '<button type="button" class="delete-btn" data-action="unapprove" data-id="' + escapeHTML(p.id) + '">Remove approval</button>'
                : '<button type="button" class="contact-btn" data-action="approve" data-id="' + escapeHTML(p.id) + '">Approve ' + (p.role === "business" ? "business" : "lecturer") + '</button>')
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
        approve: "Approve " + name + " as a verified " + (person && person.role === "business" ? "business" : "lecturer") + "?",
        unapprove: "Remove " + name + "'s approval?",
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
    unmatched_payment: "Payment did not match a trade",
    handout_payout: "Pay the lecturer (handout sale)"
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
    const actionKinds = ["dispute", "payout_due", "refund_due", "unmatched_payment", "handout_payout"];

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
                '<a class="contact-btn" href="dispute.html?id=' + id + '">Review the dispute</a>';
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
        } else if (row.kind === "handout_payout") {
            details =
                "<p><strong>Pay the lecturer " + money(row.seller_amount) + "</strong> (LBN fee " + money(row.fee_amount) + ")</p>" +
                "<p class='meta'>Handout bought by " + escapeHTML(row.buyer_name || "a student") + " for " + money(row.amount) + "</p>" +
                (row.account_number
                    ? "<p>" + escapeHTML(row.bank_name) + " &bull; " + escapeHTML(row.account_number) + " &bull; " + escapeHTML(row.account_name) + "</p>"
                    : "<p class='meta'>The lecturer has not saved a payout account yet.</p>");
            buttons = '<button type="button" class="contact-btn" data-act="handoutpaid" data-ref="' + escapeHTML(row.reference) + '">Mark as paid out</button>';
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
    } else if (act === "handoutpaid") {
        if (!confirm("Mark as paid out? Do this only after you sent the money to the lecturer's bank account.")) return;
        button.disabled = true;
        result = await db.rpc("admin_mark_handout_paid", { p_reference: button.dataset.ref });
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
    document.getElementById("feePercentLarge").value = settings.fee_percent_large || "";
    document.getElementById("largeThreshold").value = settings.large_threshold || "";
    document.getElementById("minFee").value = settings.min_fee || "";
    document.getElementById("handoutFee").value = settings.handout_fee_percent || "";
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
        ["fee_percent_large", document.getElementById("feePercentLarge").value],
        ["large_threshold", document.getElementById("largeThreshold").value],
        ["min_fee", document.getElementById("minFee").value]
    ];

    const handoutFee = document.getElementById("handoutFee").value;
    if (handoutFee !== "") pairs.push(["handout_fee_percent", handoutFee]);

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

// ---------- Graduation requests ----------

let gradRequests = [];

const gradList = document.getElementById("gradList");
const gradFilter = document.getElementById("gradFilter");

async function loadGradRequests() {
    const { data, error } = await db.rpc("admin_graduation_requests", { p_status: gradFilter.value });

    if (error) {
        gradList.innerHTML = "<p>Could not load requests. " + escapeHTML(error.message) + "</p>";
        return;
    }

    gradRequests = data;
    renderGradRequests();
}

function renderGradRequests() {
    if (gradRequests.length === 0) {
        gradList.innerHTML = "<p class='meta'>No requests here.</p>";
        return;
    }

    gradList.innerHTML = "";

    gradRequests.forEach(function (r) {
        const card = document.createElement("div");
        card.className = "business-card";

        const evidence = (r.evidence || []).map(function (e) {
            return "<div class='comment'><strong>" + (e.result === "passed" ? "Passed" : "Not yet") + "</strong> \u2022 " +
                escapeHTML(e.title) + " <span class='meta'>(" + escapeHTML(e.class) + ", " + escapeHTML(e.lecturer || "Lecturer") + ")</span>" +
                (e.note ? " \u2022 " + escapeHTML(e.note) : "") + "</div>";
        }).join("") || "<p class='meta'>No assessments recorded.</p>";

        const decided = r.status !== "pending";

        card.innerHTML = `
            <h3>${escapeHTML(r.student_name || "Student")}
                <span class="badge ${r.status === "approved" ? "lecturer" : r.status === "declined" ? "closed" : "admin"}">${r.status}</span>
            </h3>
            <p class="meta">${escapeHTML(r.student_email)} &bull; asked on ${new Date(r.created_at).toLocaleDateString()}</p>
            <p><strong>${r.lessons_done}</strong> lessons completed &bull; <strong>${r.assessments_passed}</strong> assessments passed</p>
            ${r.student_note ? "<p>Student says: " + escapeHTML(r.student_note) + "</p>" : ""}
            <details class="faq"><summary>See the evidence</summary>${evidence}</details>
            ${decided
                ? (r.admin_note ? "<p class='meta'>Your note: " + escapeHTML(r.admin_note) + "</p>" : "")
                : '<button type="button" class="contact-btn" data-grad="approve" data-id="' + escapeHTML(r.id) + '">Approve graduation</button>' +
                  '<button type="button" class="delete-btn" data-grad="decline" data-id="' + escapeHTML(r.id) + '">Decline</button>'}
        `;

        gradList.appendChild(card);
    });
}

gradList.addEventListener("click", async function (event) {
    const button = event.target.closest("button[data-grad]");
    if (!button) return;

    const approve = button.dataset.grad === "approve";

    if (!confirm(approve
        ? "Approve this graduation? The student gets marketplace access."
        : "Decline this request?")) return;

    const note = prompt(approve
        ? "Add a short note (optional):"
        : "Tell the student what to improve. They will see this:") || "";

    button.disabled = true;

    const { error } = await db.rpc("admin_decide_graduation", {
        p_request_id: button.dataset.id,
        p_approve: approve,
        p_note: note
    });

    if (error) {
        alert("Could not do that: " + error.message);
        button.disabled = false;
        return;
    }

    await Promise.all([loadGradRequests(), loadPeople()]);
});

gradFilter.addEventListener("change", loadGradRequests);

// ---------- Graduation requirements ----------

async function loadGradRules() {
    const { data } = await db.rpc("graduation_rules_now");

    if (data && data[0]) {
        document.getElementById("ruleLessons").value = data[0].min_lessons;
        document.getElementById("ruleAssessments").value = data[0].min_assessments;
    }
}

document.getElementById("gradRulesForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const message = document.getElementById("gradRulesMsg");

    const { error } = await db.rpc("admin_set_graduation_rules", {
        p_lessons: parseInt(document.getElementById("ruleLessons").value, 10),
        p_assessments: parseInt(document.getElementById("ruleAssessments").value, 10)
    });

    message.className = error ? "msg error" : "msg ok";
    message.textContent = error ? error.message : "Requirements saved.";
});

init();


// ---------- Free trial watch ----------

async function loadTrialFlags() {
    const box = document.getElementById("trialFlags");
    if (!box) return;

    const { data, error } = await db.rpc("admin_trial_flags");

    if (error) {
        box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-trial.sql in Supabase.</p>";
        return;
    }

    if (data.length === 0) {
        box.innerHTML = "<p class='meta'>Nothing to review. No suspicious free trials.</p>";
        return;
    }

    box.innerHTML = data.map(function (f) {
        return '<div class="staff-card" data-user="' + escapeHTML(f.user_id) + '"><strong>' + escapeHTML(f.full_name || "Member") + "</strong>" +
            '<br><span class="meta">' + escapeHTML(f.email) + " &bull; joined " + new Date(f.granted_at).toLocaleDateString() + "</span>" +
            "<p class='meta'>" + escapeHTML(f.reason || "") + "</p>" +
            '<div class="staff-actions"><button type="button" class="btn btn-outline trial-dismiss">Dismiss</button>' +
            '<button type="button" class="plain-btn trial-revoke" style="color:#ff6b6b;">End free trial</button></div></div>';
    }).join("");
}

document.getElementById("trialFlags").addEventListener("click", async function (event) {
    const card = event.target.closest("[data-user]");
    if (!card) return;

    const revoke = event.target.closest(".trial-revoke");
    const dismiss = event.target.closest(".trial-dismiss");
    if (!revoke && !dismiss) return;

    if (revoke && !confirm("End this person's free trial now?")) return;

    const { error } = await db.rpc("admin_review_trial", { p_user: card.dataset.user, p_action: revoke ? "revoke" : "dismiss" });

    if (error) {
        alert(error.message);
        return;
    }

    await loadTrialFlags();
});


// ---------- Go-live readiness ----------

const MANUAL_STEPS = [
    "Paystack account is activated for live payments",
    "Live secret key (sk_live_...) is saved in Supabase as PAYSTACK_SECRET_KEY",
    "Live public key (pk_live_...) is in paystack-config.js and pushed",
    "Live webhook URL is set in Paystack",
    "A small real payment was tested for a membership, a trade and a handout",
    "A refund was tested in the Paystack dashboard",
    "Settlement bank account in Paystack is correct",
    "Supabase is on the Pro plan with backups",
    "Domain and email sender are verified",
    "A Nigerian lawyer has read the Terms, Privacy and Refunds pages",
    "The business is registered with CAC"
];

function readinessRow(state, title, text) {
    return '<div class="rd-row"><span class="rd-dot rd-' + state + '"></span><div><strong>' + escapeHTML(title) +
        '</strong><div class="meta">' + escapeHTML(text) + "</div></div></div>";
}

async function loadReadiness() {
    const box = document.getElementById("readiness");
    if (!box) return;

    const { data, error } = await db.rpc("admin_readiness");

    if (error) {
        box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-readiness.sql in Supabase.</p>";
        return;
    }

    const rows = [];
    const set = data.settings || {};

    // The public key tells us whether this site takes test or real payments
    const key = typeof PAYSTACK_PUBLIC_KEY === "undefined" ? "" : String(PAYSTACK_PUBLIC_KEY);

    if (key.indexOf("pk_live_") === 0) rows.push(readinessRow("ok", "Paystack key", "LIVE. The site takes real payments."));
    else if (key.indexOf("pk_test_") === 0) rows.push(readinessRow("warn", "Paystack key", "TEST. No real money moves. Switch to the live key when you launch."));
    else rows.push(readinessRow("bad", "Paystack key", "Missing. Put your Paystack public key in paystack-config.js."));

    rows.push(set.payments_enabled === "true"
        ? readinessRow("ok", "Payments switch", "ON. Buyers can pay.")
        : readinessRow("warn", "Payments switch", "OFF. Turn it on under Payment settings when you are ready."));

    const feesOk = ["fee_percent", "fee_percent_large", "large_threshold", "min_fee"].every(function (k) { return set[k] !== undefined && set[k] !== ""; });
    rows.push(feesOk
        ? readinessRow("ok", "LBN fee", "Standard " + set.fee_percent + "%, large deals " + set.fee_percent_large + "% from \u20A6" + Number(set.large_threshold).toLocaleString() + ", smallest fee \u20A6" + Number(set.min_fee).toLocaleString() + ".")
        : readinessRow("bad", "LBN fee", "Fee settings are missing. Run supabase-fees.sql."));

    // Is the payment-checking function deployed?
    try {
        const ping = await db.functions.invoke("paystack-verify", { body: {} });
        const status = ping.error && ping.error.context ? ping.error.context.status : 200;
        rows.push(status === 404
            ? readinessRow("bad", "Payment checking function", "Not found. Deploy paystack-verify in Supabase Edge Functions.")
            : readinessRow("ok", "Payment checking function", "Deployed and answering."));
    } catch (e) {
        rows.push(readinessRow("bad", "Payment checking function", "Could not reach it. Deploy paystack-verify in Supabase Edge Functions."));
    }

    const paid = Number(data.paid_members) + Number(data.paid_trades) + Number(data.handout_sales);
    const lastDates = [data.last_membership_payment, data.last_trade_payment, data.last_handout_payment].filter(Boolean).sort();
    rows.push(paid > 0
        ? readinessRow("ok", "Payments received", paid + " payment(s) recorded. Latest: " + new Date(lastDates[lastDates.length - 1]).toLocaleString() + ".")
        : readinessRow("warn", "Payments received", "No payment has been recorded yet. Do a test payment for a membership, a trade and a handout."));

    const emailFailed = Number(data.email_failed_24h), emailSent = Number(data.email_sent_24h);
    rows.push(emailFailed > 0
        ? readinessRow("bad", "Update emails", emailFailed + " email(s) failed in the last 24 hours. Check the email_queue error column.")
        : emailSent > 0
            ? readinessRow("ok", "Update emails", emailSent + " sent in the last 24 hours.")
            : readinessRow("warn", "Update emails", "No email sent in the last 24 hours. Follow EMAIL-SETUP.md and send a test."));

    rows.push(Number(data.payouts_due) > 0
        ? readinessRow("warn", "Payouts waiting", data.payouts_due + " payout(s) are due to sellers and lecturers. Pay them and mark them done.")
        : readinessRow("ok", "Payouts waiting", "Nothing waiting."));

    rows.push(Number(data.refunds_due) > 0
        ? readinessRow("warn", "Refunds waiting", data.refunds_due + " refund(s) are due to buyers. Refund them in Paystack and mark them done.")
        : readinessRow("ok", "Refunds waiting", "Nothing waiting."));

    rows.push(Number(data.open_disputes) > 0
        ? readinessRow("warn", "Open disputes", data.open_disputes + " dispute(s) need a decision.")
        : readinessRow("ok", "Open disputes", "None."));

    rows.push(Number(data.sellers_missing_bank) > 0
        ? readinessRow("bad", "Sellers without bank details", data.sellers_missing_bank + " seller(s) are owed money but have not added a payout account.")
        : readinessRow("ok", "Sellers without bank details", "None."));

    // Are the legal pages still marked as drafts?
    const drafts = [];
    for (const page of ["terms.html", "privacy.html", "refunds.html"]) {
        try {
            const res = await fetch(page, { cache: "no-store" });
            const html = res.ok ? await res.text() : "";
            if (!res.ok) drafts.push(page + " (missing)");
            else if (html.indexOf("draft-note") !== -1) drafts.push(page);
        } catch (e) {
            drafts.push(page);
        }
    }
    rows.push(drafts.length === 0
        ? readinessRow("ok", "Legal pages", "Terms, Privacy and Refunds are published.")
        : readinessRow("warn", "Legal pages", "Still marked as draft or missing: " + drafts.join(", ") + "."));

    box.innerHTML = rows.join("");

    // Steps that only you can confirm
    const saved = JSON.parse(localStorage.getItem("lbn_golive") || "{}");
    const manual = document.getElementById("manualChecks");

    manual.innerHTML = MANUAL_STEPS.map(function (step, i) {
        return '<label class="toggle-row"><span>' + escapeHTML(step) + '</span><input type="checkbox" data-step="' + i + '"' + (saved[i] ? " checked" : "") + "></label>";
    }).join("");

    manual.onchange = function (event) {
        const box2 = event.target.closest("[data-step]");
        if (!box2) return;

        saved[box2.dataset.step] = box2.checked;
        localStorage.setItem("lbn_golive", JSON.stringify(saved));
    };
}


// ---------- Reported reviews ----------

async function loadReviewReports() {
    const box = document.getElementById("reviewReports");
    if (!box) return;

    const { data, error } = await db.rpc("admin_reported_reviews");

    if (error) {
        box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-reviews.sql in Supabase.</p>";
        return;
    }

    box.innerHTML = data.length === 0 ? "<p class='meta'>No reported reviews.</p>" : data.map(function (r) {
        return '<div class="staff-card" data-review="' + escapeHTML(r.id) + '"><strong>' + "\u2605".repeat(r.rating) + "</strong> " +
            escapeHTML(r.reviewer_name || "Member") + " about " + escapeHTML(r.reviewee_name || "Member") +
            '<div class="meta">' + escapeHTML(r.item || "") + "</div>" +
            "<p>" + escapeHTML(r.comment || "(no comment)") + "</p>" +
            "<p class='meta'>Reason for the report: " + escapeHTML(r.report_reason || "") + "</p>" +
            '<div class="staff-actions"><button type="button" class="btn btn-outline review-keep">Keep it</button>' +
            '<button type="button" class="plain-btn review-hide" style="color:#ff6b6b;">Hide it</button></div></div>';
    }).join("");
}

document.getElementById("reviewReports").addEventListener("click", async function (event) {
    const card = event.target.closest("[data-review]");
    if (!card) return;

    const hide = event.target.closest(".review-hide");
    const keep = event.target.closest(".review-keep");
    if (!hide && !keep) return;

    const { error } = await db.rpc("admin_review_action", { p_review_id: card.dataset.review, p_action: hide ? "hide" : "keep" });

    if (error) {
        alert(error.message);
        return;
    }

    await loadReviewReports();
});


// ---------- Recover a payment ----------

document.getElementById("recoverBtn").addEventListener("click", async function () {
    const reference = document.getElementById("recoverRef").value.trim();
    const msg = document.getElementById("recoverMsg");

    if (!reference) {
        msg.textContent = "Paste a Paystack reference first.";
        msg.className = "msg error";
        return;
    }

    msg.textContent = "Checking with Paystack...";
    msg.className = "msg";

    const { data, error } = await db.functions.invoke("paystack-verify", { body: { reference: reference } });

    let text = data && data.result ? "Done: " + data.result + "." : "";

    if (error) {
        text = error.message;

        if (error.context && typeof error.context.json === "function") {
            try { text = (await error.context.json()).error || text; } catch (e) {}
        }
    }

    msg.textContent = text || "No answer. Is the paystack-verify function deployed?";
    msg.className = "msg " + (error ? "error" : "ok");
});