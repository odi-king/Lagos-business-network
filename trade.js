const tradeId = new URLSearchParams(window.location.search).get("id");

const TRADE_SELECT =
    "*, buyer:profiles!trades_buyer_id_fkey(full_name, role, approved, verified, is_admin), " +
    "seller:profiles!trades_seller_id_fkey(full_name, role, approved, verified, is_admin)";

const STATUS_LABELS = {
    negotiating: "Negotiating",
    agreed: "Deal agreed",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled"
};

const STATUS_CLASSES = {
    negotiating: "badge",
    agreed: "badge lecturer",
    delivered: "badge trader",
    completed: "badge lecturer",
    cancelled: "badge closed"
};

let me = null;
let trade = null;
let lastSignature = "";
let lastStatus = "";

const chatBox = document.getElementById("chatBox");
const chatNote = document.getElementById("chatNote");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const offerForm = document.getElementById("offerForm");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function money(amount) {
    return "\u20A6" + Number(amount).toLocaleString();
}

function showNote(text, type) {
    chatNote.textContent = text;
    chatNote.className = "msg " + (type || "error");
}

function nameFor(userId) {
    const person = userId === trade.buyer_id ? trade.buyer : trade.seller;
    return person && person.full_name ? person.full_name : "Member";
}

function isParticipant() {
    return trade && (trade.buyer_id === me.id || trade.seller_id === me.id);
}

async function init() {
    if (!db) {
        document.getElementById("chatTitle").textContent = "Supabase is not connected yet.";
        return;
    }

    if (!tradeId) {
        window.location.href = "trades.html";
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    me = data.session.user;

    if (!(await hasActiveMembership(me.id))) {
        window.location.href = "pay.html";
        return;
    }

    await refresh();

    // The chat checks for new messages every few seconds while the page is open
    setInterval(function () {
        if (!document.hidden) refresh();
    }, 4000);
}

async function refresh() {
    const result = await db.from("trades").select(TRADE_SELECT).eq("id", tradeId).maybeSingle();

    if (result.error || !result.data) {
        document.getElementById("chatTitle").textContent = "Trade not found";
        return;
    }

    trade = result.data;
    renderHeader();

    if (trade.status !== lastStatus) {
        applyStatus();
        lastStatus = trade.status;
    }

    const messages = await db
        .from("trade_messages")
        .select("*")
        .eq("trade_id", tradeId)
        .order("created_at", { ascending: true });

    if (messages.error) {
        showNote("Could not load messages. " + messages.error.message);
        return;
    }

    renderMessages(messages.data);
}

function renderHeader() {
    document.title = trade.business_name + " - Lagos Business Network";
    document.getElementById("chatTitle").textContent = trade.business_name;

    const buyer = nameFor(trade.buyer_id) + badgeHTML(trade.buyer);
    const seller = nameFor(trade.seller_id) + badgeHTML(trade.seller);
    document.getElementById("chatParties").innerHTML =
        "Buyer: " + (trade.buyer_id === me.id ? "You" : escapeHTML(nameFor(trade.buyer_id)) + badgeHTML(trade.buyer)) +
        " \u2022 Seller: " + (trade.seller_id === me.id ? "You" : escapeHTML(nameFor(trade.seller_id)) + badgeHTML(trade.seller));

    const badge = document.getElementById("statusBadge");
    badge.textContent = STATUS_LABELS[trade.status] || trade.status;
    badge.className = STATUS_CLASSES[trade.status] || "badge";

    document.getElementById("agreedLine").textContent =
        trade.agreed_amount ? "Agreed price: " + money(trade.agreed_amount) : "";
}

// Shows or hides the buttons and forms that fit the trade's stage
function applyStatus() {
    const status = trade.status;
    const closed = status === "completed" || status === "cancelled";
    const participant = isParticipant();
    const isBuyer = trade.buyer_id === me.id;
    const isSeller = trade.seller_id === me.id;

    chatForm.style.display = !closed && participant ? "flex" : "none";
    offerForm.style.display = status === "negotiating" && participant ? "flex" : "none";

    document.getElementById("cancelBtn").style.display =
        (status === "negotiating" || status === "agreed") && participant ? "" : "none";
    document.getElementById("deliveredBtn").style.display =
        status === "agreed" && isSeller ? "" : "none";
    document.getElementById("receivedBtn").style.display =
        status === "delivered" && isBuyer ? "" : "none";
    document.getElementById("reportBtn").style.display = participant ? "" : "none";

    const notice = document.getElementById("closedNotice");

    if (closed) {
        notice.style.display = "block";
        notice.textContent = status === "completed"
            ? "This trade is completed. The chat is now closed."
            : "This trade was cancelled. The chat is now closed.";
    } else if (!participant) {
        notice.style.display = "block";
        notice.textContent = "You are viewing this chat as an administrator.";
    } else {
        notice.style.display = "none";
    }
}

function renderMessages(rows) {
    const signature = rows.map(function (r) { return r.id + ":" + (r.offer_status || ""); }).join("|");
    if (signature === lastSignature) return;

    const firstLoad = lastSignature === "";
    const nearBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 120;
    lastSignature = signature;

    chatBox.innerHTML = "";

    rows.forEach(function (r) {
        const mine = r.sender_id === me.id;
        const item = document.createElement("div");

        if (r.kind === "system") {
            item.className = "chat-system";
            item.textContent = r.body;
        } else if (r.kind === "offer") {
            item.className = "offer-card " + (mine ? "mine" : "theirs");

            let status = "";
            let buttons = "";

            if (r.offer_status === "pending") {
                status = mine ? "Waiting for a reply" : "Waiting for your reply";
                if (!mine && trade.status === "negotiating" && isParticipant()) {
                    buttons =
                        '<div class="chat-actions">' +
                        '<button type="button" class="contact-btn offer-accept" data-id="' + escapeHTML(r.id) + '">Accept</button>' +
                        '<button type="button" class="delete-btn offer-decline" data-id="' + escapeHTML(r.id) + '">Decline</button>' +
                        "</div>";
                }
            } else if (r.offer_status === "accepted") {
                status = "Accepted";
            } else if (r.offer_status === "declined") {
                status = "Declined";
            } else {
                status = "Replaced by a newer offer";
            }

            item.innerHTML =
                '<div class="chat-name">' + (mine ? "You" : escapeHTML(nameFor(r.sender_id))) + " made an offer</div>" +
                '<div class="offer-amount">' + money(r.amount) + "</div>" +
                (r.body ? "<div>" + escapeHTML(r.body) + "</div>" : "") +
                '<div class="meta">' + status + "</div>" +
                buttons;
        } else {
            item.className = "chat-msg " + (mine ? "mine" : "theirs");
            item.innerHTML =
                (mine ? "" : '<div class="chat-name">' + escapeHTML(nameFor(r.sender_id)) + "</div>") +
                escapeHTML(r.body);
        }

        chatBox.appendChild(item);
    });

    if (firstLoad || nearBottom) {
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// ---------- Sending ----------

chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const text = chatInput.value.trim();
    if (!text) return;

    const button = document.getElementById("sendBtn");
    button.disabled = true;
    showNote("");

    const { error } = await db.rpc("send_message", { p_trade_id: tradeId, p_body: text });

    button.disabled = false;

    if (error) {
        showNote(error.message);
        return;
    }

    chatInput.value = "";
    await refresh();
});

offerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const amount = parseInt(document.getElementById("offerAmount").value, 10);
    const note = document.getElementById("offerNote").value.trim();

    showNote("");

    const { error } = await db.rpc("send_offer", {
        p_trade_id: tradeId,
        p_amount: amount,
        p_note: note
    });

    if (error) {
        showNote(error.message);
        return;
    }

    offerForm.reset();
    await refresh();
});

chatBox.addEventListener("click", async function (event) {
    const accept = event.target.closest(".offer-accept");
    const decline = event.target.closest(".offer-decline");
    const button = accept || decline;
    if (!button) return;

    if (accept && !confirm("Accept this offer?")) return;

    button.disabled = true;
    showNote("");

    const { error } = await db.rpc("respond_offer", {
        p_message_id: button.dataset.id,
        p_accept: !!accept
    });

    if (error) {
        showNote(error.message);
        button.disabled = false;
        return;
    }

    await refresh();
});

// ---------- Trade actions ----------

async function runAction(name, question) {
    if (!confirm(question)) return;

    showNote("");

    const { error } = await db.rpc(name, { p_trade_id: tradeId });

    if (error) {
        showNote(error.message);
        return;
    }

    await refresh();
}

document.getElementById("cancelBtn").addEventListener("click", function () {
    runAction("cancel_trade", "Cancel this trade? The chat will close for both of you.");
});

document.getElementById("deliveredBtn").addEventListener("click", function () {
    runAction("mark_delivered", "Mark this as delivered?");
});

document.getElementById("receivedBtn").addEventListener("click", function () {
    runAction("confirm_received", "Confirm you received everything that was agreed? This completes the trade and closes the chat.");
});

document.getElementById("reportBtn").addEventListener("click", async function () {
    const reason = prompt("Tell us what is wrong. The LBN team will look at it.");
    if (!reason) return;

    const { error } = await db.rpc("report_trade", { p_trade_id: tradeId, p_reason: reason });

    if (error) {
        showNote(error.message);
        return;
    }

    showNote("Thank you. Your report was sent to the LBN team.", "ok");
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();