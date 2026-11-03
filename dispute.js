const tradeId = new URLSearchParams(window.location.search).get("id");

const CATEGORY_LABELS = {
    not_delivered: "Not delivered on time",
    not_as_described: "Not as described",
    poor_quality: "Poor quality or incomplete",
    no_response: "The other person stopped replying",
    other: "Other problem"
};

let view = null;
let messageCount = -1;

function esc(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function money(value) {
    return "\u20A6" + Number(value || 0).toLocaleString();
}

function when(value) {
    return value ? new Date(value).toLocaleString() : "Not yet";
}

function row(label, value) {
    return '<p class="kv"><span class="meta">' + label + "</span><strong>" + value + "</strong></p>";
}

async function init() {
    if (!db) {
        document.getElementById("pageNote").textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const session = (await db.auth.getSession()).data.session;

    if (!session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("dispute.html?id=" + tradeId);
        return;
    }

    if (!tradeId) {
        document.getElementById("pageNote").textContent = "No trade was chosen. Open this from the Admin page.";
        return;
    }

    const access = await db.rpc("my_admin_access");
    const row0 = access.data && access.data[0];
    const allowed = row0 && (row0.is_super || row0.permissions.indexOf("marketplace") !== -1 || row0.permissions.indexOf("finance") !== -1);

    if (!allowed) {
        document.getElementById("pageNote").textContent = "Only admins who handle disputes can open this page.";
        return;
    }

    await load();
    document.getElementById("body").style.display = "block";

    setInterval(function () {
        if (!document.hidden) loadMessages(false);
    }, 8000);
}

async function load() {
    const result = await db.rpc("admin_dispute_view", { p_trade_id: tradeId });

    if (result.error || !result.data) {
        document.getElementById("pageNote").textContent =
            "Could not open this dispute. " + (result.error ? result.error.message : "Run supabase-disputes.sql in Supabase.");
        return;
    }

    view = result.data;
    renderFacts();
    await Promise.all([loadEvidence(), loadMessages(true)]);
}

function renderFacts() {
    const t = view.trade;
    const d = view.dispute;
    const bank = view.seller_bank;

    document.getElementById("tradeTitle").textContent = t.business_name;

    const badge = document.getElementById("statusBadge");
    badge.textContent = t.status === "disputed" ? "In dispute: money on hold" : t.status;
    badge.className = "badge " + (t.status === "disputed" ? "admin" : "closed");

    document.getElementById("tradeFacts").innerHTML =
        row("Buyer", esc(view.buyer.name || "Member") + " (" + esc(view.buyer.email) + ")") +
        row("Seller", esc(view.seller.name || "Member") + " (" + esc(view.seller.email) + ")") +
        row("Agreed amount", money(t.agreed_amount)) +
        row("Delivery date", t.deliver_by ? when(t.deliver_by) : "None was agreed") +
        row("Paid", t.paid_at ? when(t.paid_at) + " (reference " + esc(t.payment_reference || "") + ")" : "Not paid through LBN") +
        row("LBN fee", t.fee_amount !== null ? money(t.fee_amount) : "Not set") +
        row("Seller would receive", t.seller_amount !== null ? money(t.seller_amount) : "Not set") +
        (bank ? row("Seller bank", esc(bank.bank_name) + ", " + esc(bank.account_number) + ", " + esc(bank.account_name)) : "");

    document.getElementById("disputeFacts").innerHTML = d
        ? row("Opened by", esc(d.opened_by_name || "Member")) +
          row("Problem", esc(CATEGORY_LABELS[d.category] || "Not stated")) +
          row("Opened", when(d.created_at)) +
          "<p>" + esc(d.reason) + "</p>" +
          (d.status === "resolved"
              ? row("Decision", esc(d.decision) + (t.refund_amount ? " (buyer gets " + money(t.refund_amount) + ")" : "")) +
                (d.admin_note ? "<p class='meta'>Note: " + esc(d.admin_note) + "</p>" : "")
              : "")
        : "<p class='meta'>No dispute has been opened for this trade.</p>";

    const open = t.status === "disputed";
    document.getElementById("adminForm").style.display = open ? "flex" : "none";
    document.getElementById("decisionPanel").style.display = open ? "block" : "none";
}

async function loadEvidence() {
    const list = document.getElementById("evidenceList");
    const { data, error } = await db.rpc("dispute_evidence_list", { p_trade_id: tradeId });

    if (error) {
        list.innerHTML = "<p class='meta'>Could not load the evidence.</p>";
        return;
    }

    if (data.length === 0) {
        list.innerHTML = "<p class='meta'>Nobody has added evidence yet.</p>";
        return;
    }

    const items = await Promise.all(data.map(async function (e) {
        const signed = await db.storage.from("dispute-evidence").createSignedUrl(e.file_path, 3600);
        const url = signed.data ? signed.data.signedUrl : "";
        const isImage = /\.(jpe?g|png|webp)$/i.test(e.file_name) || /\.(jpe?g|png|webp)$/i.test(e.file_path);

        return '<div class="evidence-item">' +
            (isImage && url
                ? '<a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="Evidence"></a>'
                : '<a class="btn btn-outline" href="' + esc(url) + '" target="_blank" rel="noopener">Open ' + esc(e.file_name) + "</a>") +
            '<p class="meta">From ' + esc(e.added_by_name || "Member") + ", " + when(e.created_at) + "</p>" +
            (e.note ? "<p>" + esc(e.note) + "</p>" : "") + "</div>";
    }));

    list.innerHTML = '<div class="evidence-grid">' + items.join("") + "</div>";
}

function whoSaid(r) {
    if (r.kind === "system") return "LBN system";
    if (r.kind === "admin") return "LBN team";
    if (r.sender_id === view.buyer.id) return "Buyer (" + (view.buyer.name || "Member") + ")";
    if (r.sender_id === view.seller.id) return "Seller (" + (view.seller.name || "Member") + ")";
    return "Member";
}

async function loadMessages(first) {
    const { data, error } = await db
        .from("trade_messages")
        .select("*")
        .eq("trade_id", tradeId)
        .order("created_at", { ascending: true });

    if (error || !data) return;
    if (data.length === messageCount) return;

    messageCount = data.length;

    const box = document.getElementById("chatBox");
    box.innerHTML = data.map(function (r) {
        const cls = r.kind === "system" ? "chat-system" : r.kind === "admin" ? "chat-msg admin-msg" : "chat-msg theirs";
        const text = r.kind === "offer"
            ? "Offer: " + money(r.amount) + (r.body ? " (" + esc(r.body) + ")" : "") + (r.deadline_at ? ", deliver by " + new Date(r.deadline_at).toLocaleDateString() : "")
            : esc(r.body);

        return '<div class="' + cls + '"><div class="chat-name">' + esc(whoSaid(r)) + "</div>" + text +
            '<div class="msg-meta"><span class="msg-time">' + when(r.created_at) + "</span></div></div>";
    }).join("");

    if (first || box.scrollHeight - box.scrollTop - box.clientHeight < 150) box.scrollTop = box.scrollHeight;
}

document.getElementById("adminForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const input = document.getElementById("adminInput");
    const text = input.value.trim();
    if (!text) return;

    const button = document.getElementById("adminSend");
    button.disabled = true;

    const { error } = await db.rpc("admin_dispute_message", { p_trade_id: tradeId, p_body: text });

    button.disabled = false;

    if (error) {
        document.getElementById("adminNote").textContent = error.message;
        document.getElementById("adminNote").className = "msg error";
        return;
    }

    document.getElementById("adminNote").textContent = "";
    input.value = "";
    await loadMessages(true);
});

document.getElementById("decision").addEventListener("change", function (event) {
    document.getElementById("buyerAmount").style.display = event.target.value === "split" ? "" : "none";
});

document.getElementById("decideBtn").addEventListener("click", async function () {
    const decision = document.getElementById("decision").value;
    const note = document.getElementById("decisionNote").value.trim();
    const amount = parseInt(document.getElementById("buyerAmount").value, 10);
    const msg = document.getElementById("decisionMsg");

    if (note.length < 10) {
        msg.textContent = "Please explain your decision in a few words. Both people will see it.";
        msg.className = "msg error";
        return;
    }

    const words = {
        release: "Release the money to the seller and complete the trade?",
        refund: "Refund the buyer in full and close the trade?",
        split: "Split the money (" + money(amount) + " back to the buyer) and close the trade?"
    };

    if (!confirm(words[decision] + " This cannot be undone.")) return;

    const params = { p_trade_id: tradeId, p_decision: decision, p_note: note };
    if (decision === "split") params.p_buyer_amount = amount;

    const button = document.getElementById("decideBtn");
    button.disabled = true;

    const { error } = await db.rpc("admin_resolve_dispute", params);

    button.disabled = false;

    if (error) {
        msg.textContent = error.message;
        msg.className = "msg error";
        return;
    }

    msg.textContent = "Decision saved. The trade is closed.";
    msg.className = "msg ok";
    await load();
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();