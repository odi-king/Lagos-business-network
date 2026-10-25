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

STATUS_LABELS.paid = "Paid, held by LBN";
STATUS_LABELS.disputed = "Dispute: money on hold";
STATUS_LABELS.refunded = "Refunded";
STATUS_LABELS.delivered = "Done, awaiting confirmation";
STATUS_CLASSES.paid = "badge trader";
STATUS_CLASSES.disputed = "badge admin";
STATUS_CLASSES.refunded = "badge closed";

let paymentsEnabled = false;
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

function isService() {
    return !!trade && trade.trade_kind === "service";
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

    const flag = await db.rpc("trade_payments_enabled");
    paymentsEnabled = !flag.error && flag.data === true;

    document.getElementById("scamPay").textContent = paymentsEnabled
        ? "Pay only with the Pay now button on this page. The seller gets the money only after you confirm. Never send money anywhere else."
        : "Do not send money to anyone yet. Protected payment on LBN is coming soon, so agree the price and details here first.";

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

    let line = (isService() ? "Service" : "Item") + (trade.agreed_amount ? " \u2022 Agreed price: " + money(trade.agreed_amount) : "");

    if (trade.paid_at) {
        line += " \u2022 Paid and held by LBN";
        if (trade.seller_id === me.id && trade.seller_amount) {
            line += " \u2022 You receive " + money(trade.seller_amount) + " after the LBN fee of " + money(trade.fee_amount);
        }
    }

    document.getElementById("agreedLine").textContent = line;
}

// Shows or hides the buttons and forms that fit the trade's stage
function applyStatus() {
    const status = trade.status;
    const closed = status === "completed" || status === "cancelled" || status === "refunded";
    const participant = isParticipant();
    const isBuyer = trade.buyer_id === me.id;
    const isSeller = trade.seller_id === me.id;

    chatForm.style.display = !closed && participant ? "flex" : "none";
    offerForm.style.display = status === "negotiating" && participant ? "flex" : "none";

    document.getElementById("cancelBtn").style.display =
        (status === "negotiating" || status === "agreed") && participant ? "" : "none";
    document.getElementById("payBtn").style.display =
        status === "agreed" && isBuyer && paymentsEnabled ? "" : "none";
    document.getElementById("deliveredBtn").style.display =
        (status === "paid" || (status === "agreed" && !paymentsEnabled)) && isSeller ? "" : "none";
    document.getElementById("receivedBtn").style.display =
        (status === "paid" || status === "delivered") && isBuyer ? "" : "none";
    document.getElementById("disputeBtn").style.display =
        (status === "paid" || status === "delivered") && participant ? "" : "none";
    document.getElementById("reportBtn").style.display = participant ? "" : "none";

    document.getElementById("deliveredBtn").textContent = isService() ? "Service done" : "Mark as delivered";
    document.getElementById("receivedBtn").textContent = isService() ? "Confirm service completed" : "Confirm received";

    const payNote = document.getElementById("payNote");

    if (status === "agreed" && isBuyer) {
        payNote.textContent = paymentsEnabled
            ? "Tap Pay now. LBN holds your money. The seller is paid only after you confirm you got exactly what you ordered."
            : "Protected payment is coming soon. Do not send money outside LBN.";
    } else if (status === "agreed" && isSeller) {
        payNote.textContent = paymentsEnabled
            ? isService() ? "Waiting for the buyer to pay. Do not start the work until the payment shows here." : "Waiting for the buyer to pay. Do not deliver until the payment shows here."
            : "";
    } else if (status === "paid" && isSeller) {
        payNote.textContent = isService() ? "The buyer has paid and LBN is holding the money. Do the work, then tap Service done." : "The buyer has paid and LBN is holding the money. Deliver now, then tap Mark as delivered.";
    } else if (status === "paid" && isBuyer) {
        payNote.textContent = "Your payment is held safely by LBN until you confirm.";
    } else if (status === "delivered" && isBuyer) {
        payNote.textContent = isService() ? "The seller says the service is done. Check the work. If it is right, tap Confirm service completed and the money is released. If not, open a dispute and the money stays on hold." : "Check that you got exactly what you ordered. If yes, tap Confirm received. If not, open a dispute and the money stays on hold.";
    } else if (status === "disputed") {
        payNote.textContent = "This trade is in dispute. The money stays on hold until the LBN team decides. Keep explaining in the chat.";
    } else {
        payNote.textContent = "";
    }

    const notice = document.getElementById("closedNotice");

    if (closed) {
        notice.style.display = "block";
        notice.textContent =
            status === "completed" ? "This trade is completed. The chat is now closed." :
            status === "refunded" ? "This trade was refunded. The chat is now closed." :
            "This trade was cancelled. The chat is now closed.";
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
    runAction("mark_delivered", isService() ? "Is the service finished? The buyer will be asked to confirm it." : "Mark this as delivered?");
});

document.getElementById("receivedBtn").addEventListener("click", function () {
    runAction("confirm_received", isService() ? "Confirm the service was done properly? This releases the money to the seller and closes the chat." : "Confirm you received everything that was agreed? This completes the trade and closes the chat.");
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

document.getElementById("payBtn").addEventListener("click", function () {
    if (typeof PAYSTACK_PUBLIC_KEY === "undefined" || PAYSTACK_PUBLIC_KEY.indexOf("PASTE") === 0) {
        showNote("Payments are not set up yet. The Paystack key is missing.");
        return;
    }

    if (typeof PaystackPop === "undefined") {
        showNote("The payment window could not load. Check your internet and try again.");
        return;
    }

    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: me.email,
        amount: trade.agreed_amount * 100, // Paystack counts in kobo
        currency: "NGN",
        ref: "TRD-" + trade.id.slice(0, 8) + "-" + Date.now(),
        metadata: { kind: "trade", trade_id: trade.id },
        callback: function () {
            showNote("Payment received. Confirming it now...", "ok");
            setTimeout(refresh, 2500);
        },
        onClose: function () {}
    });

    handler.openIframe();
});

document.getElementById("disputeBtn").addEventListener("click", async function () {
    const reason = prompt("Tell us clearly what is wrong. The money will stay on hold until the LBN team decides.");
    if (!reason) return;

    const { error } = await db.rpc("open_dispute", { p_trade_id: tradeId, p_reason: reason });

    if (error) {
        showNote(error.message);
        return;
    }

    await refresh();
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();