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
STATUS_LABELS.settled = "Settled by the LBN team";
STATUS_LABELS.delivered = "Done, awaiting confirmation";
STATUS_CLASSES.paid = "badge trader";
STATUS_CLASSES.disputed = "badge admin";
STATUS_CLASSES.refunded = "badge closed";
STATUS_CLASSES.settled = "badge closed";

let paymentsEnabled = false;
let me = null;
let trade = null;
let lastSignature = "";
let replyTo = null;
let currentRows = [];
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

    const stateKey = trade.status + ":" + (trade.buyer_confirmed_at ? "b" : "") + (trade.seller_confirmed_at ? "s" : "");

    if (stateKey !== lastStatus) {
        applyStatus();
        lastStatus = stateKey;
        updateDisputeUI();
        updateFeeUI();
        loadReview();
        loadPartnerRating();
        renderSteps();
        renderMoneyState();
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

    // Looking at the chat marks the other person's messages as Seen
    if (isParticipant() && !document.hidden) {
        db.rpc("mark_trade_seen", { p_trade_id: tradeId }).then(function () {}, function () {});
    }
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

    if (trade.deliver_by) {
        document.getElementById("agreedLine").textContent += " Deliver by " +
            new Date(trade.deliver_by).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + ".";
    }

    const postLinkEl = document.getElementById("postLink");

    if (postLinkEl) {
        postLinkEl.style.display = trade.post_id ? "inline" : "none";
        if (trade.post_id) postLinkEl.href = "post.html?id=" + encodeURIComponent(trade.post_id);
    }
}

// Shows or hides the buttons and forms that fit the trade's stage
function applyStatus() {
    const status = trade.status;
    const closed = status === "completed" || status === "cancelled" || status === "refunded" || status === "settled";
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
        status === "delivered" && isBuyer && !trade.buyer_confirmed_at ? "" : "none";
    document.getElementById("sellerDoneBtn").style.display =
        status === "delivered" && !isBuyer && !trade.seller_confirmed_at ? "" : "none";
    document.getElementById("disputeBtn").style.display =
        (status === "agreed" || status === "paid" || status === "delivered") && participant ? "" : "none";
    document.getElementById("reportBtn").style.display = participant ? "" : "none";

    document.getElementById("deliveredBtn").textContent = isService() ? "Service done" : "Mark as delivered";
    document.getElementById("receivedBtn").textContent = "I am satisfied: confirm complete";

    document.getElementById("checkPayBtn").style.display =
        status === "agreed" && isBuyer && paymentsEnabled && localStorage.getItem("lbn_pay_" + tradeId) ? "" : "none";

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

    if (status === "delivered") {
        const you = isBuyer ? trade.buyer_confirmed_at : trade.seller_confirmed_at;
        const other = isBuyer ? trade.seller_confirmed_at : trade.buyer_confirmed_at;

        if (you && !other) {
            payNote.textContent = "You confirmed. Waiting for the other person to confirm. The trade closes when both of you confirm.";
        } else if (!you && other) {
            payNote.textContent = "The other person confirmed. Please confirm if you are satisfied, or open a dispute.";
        } else if (!you) {
            payNote.textContent = (isBuyer ? "Check what you received. " : "") +
                "The trade closes only when both of you confirm that it is complete and you are satisfied.";
        }
    }

    const notice = document.getElementById("closedNotice");

    if (closed) {
        notice.style.display = "block";
        notice.textContent =
            status === "completed" ? "This trade is completed. The chat is now closed." :
            status === "settled" ? "The LBN team settled this dispute. The chat is now closed." :
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
    currentRows = rows;
    const signature = rows.map(function (r) { return r.id + ":" + (r.offer_status || "") + ":" + chatStatus(r); }).join("|");
    if (signature === lastSignature) return;

    const firstLoad = lastSignature === "";
    const nearBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 120;
    lastSignature = signature;

    chatBox.innerHTML = "";

    const byId = {};
    rows.forEach(function (r) { byId[r.id] = r; });

    let lastMine = null;
    rows.forEach(function (r) {
        if (r.sender_id === me.id && r.kind !== "system" && r.kind !== "offer") lastMine = r;
    });

    const canReply = isParticipant() && chatForm.style.display !== "none";

    rows.forEach(function (r) {
        const mine = r.sender_id === me.id;
        const item = document.createElement("div");

        if (r.kind === "admin") {
            item.className = "chat-msg admin-msg";
            item.innerHTML = '<div class="chat-name">LBN team</div>' + escapeHTML(r.body) +
                '<div class="msg-meta"><span class="msg-time">' + chatTime(r.created_at) + "</span></div>";
            chatBox.appendChild(item);
            return;
        }


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
            item.dataset.id = r.id;
            item.innerHTML =
                (mine ? "" : '<div class="chat-name">' + escapeHTML(nameFor(r.sender_id)) + "</div>") +
                (r.reply_to ? quoteHTML(byId[r.reply_to], function (id) { return id === me.id ? "You" : nameFor(id); }) : "") +
                escapeHTML(r.body) +
                '<div class="msg-meta"><span class="msg-time">' + chatTime(r.created_at) + "</span>" +
                (canReply ? '<button type="button" class="reply-link" data-id="' + escapeHTML(r.id) + '">Reply</button>' : "") +
                (mine ? ticksHTML(r) : "") + "</div>";
        }

        chatBox.appendChild(item);

        if (lastMine && r.id === lastMine.id) {
            const line = document.createElement("div");
            line.className = "status-line";
            line.textContent = chatStatusWord(r);
            chatBox.appendChild(line);
        }
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

    const params = { p_trade_id: tradeId, p_body: text };
    if (replyTo) params.p_reply_to = replyTo.id;

    const { error } = await db.rpc("send_message", params);

    button.disabled = false;

    if (error) {
        showNote(error.message);
        return;
    }

    chatInput.value = "";
    cancelReply();
    await refresh();
});

// ---------- Reply to a message ----------

function cancelReply() {
    replyTo = null;
    hideReplyBar();
}

document.getElementById("replyCancel").addEventListener("click", cancelReply);

chatBox.addEventListener("click", function (event) {
    const reply = event.target.closest(".reply-link");

    if (reply) {
        const row = currentRows.find(function (r) { return r.id === reply.dataset.id; });
        if (!row) return;

        replyTo = { id: row.id };
        setReplyBar(row.sender_id === me.id ? "yourself" : nameFor(row.sender_id), chatSnippet(row));
        chatInput.focus();
        return;
    }

    const quote = event.target.closest(".reply-quote[data-goto]");
    if (quote) jumpToMessage(chatBox, quote.dataset.goto);
});

document.addEventListener("visibilitychange", function () {
    if (!document.hidden && trade) refresh();
});

offerForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const amount = parseInt(document.getElementById("offerAmount").value, 10);
    const note = document.getElementById("offerNote").value.trim();

    showNote("");

    const offerParams = { p_trade_id: tradeId, p_amount: amount, p_note: note };
    const deliverBy = document.getElementById("offerDeliverBy").value;

    // The end of the chosen day, so the seller has the whole day
    if (deliverBy) offerParams.p_deliver_by = new Date(deliverBy + "T23:59:00").toISOString();

    const { error } = await db.rpc("send_offer", offerParams);

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

document.getElementById("sellerDoneBtn").addEventListener("click", function () {
    runAction("confirm_complete", "Confirm that the transaction is complete and you are satisfied? The trade closes only when both of you confirm.");
});

document.getElementById("receivedBtn").addEventListener("click", function () {
    runAction("confirm_complete", "Confirm that the transaction is complete and you are satisfied? The trade closes only when both of you confirm.");
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

// ---------- The LBN fee, shown before anyone pays ----------

let feeSchedule = null;
let feeQuote = null;

function pctText(value) {
    return String(Number(value));
}

function feeNoteText() {
    if (!feeSchedule) return "";

    return "Chatting and making offers are free. LBN charges " + pctText(feeSchedule.standard_percent) +
        "% only when the buyer pays (" + pctText(feeSchedule.large_percent) + "% on deals of " + money(feeSchedule.large_threshold) +
        " or more). The fee is taken from the seller's payment, so the buyer pays no extra.";
}

function feeRows(q) {
    const isBuyer = trade.buyer_id === me.id;

    return '<div class="fee-row"><span>Agreed price</span><strong>' + money(q.amount) + "</strong></div>" +
        '<div class="fee-row"><span>LBN fee (' + pctText(q.percent) + "%" + (q.tier === "large" ? ", large deal rate" : "") +
        ')</span><strong>- ' + money(q.fee) + "</strong></div>" +
        '<div class="fee-row total"><span>' + (isBuyer ? "The seller receives" : "You receive") + "</span><strong>" + money(q.seller_amount) + "</strong></div>";
}

async function updateFeeUI() {
    if (!trade || !me) return;

    if (!feeSchedule) {
        const schedule = await db.rpc("fee_schedule");
        feeSchedule = schedule.data && schedule.data[0] ? schedule.data[0] : null;
    }

    const note = document.getElementById("offerFeeNote");
    if (note) note.textContent = feeNoteText();

    const box = document.getElementById("feeBox");
    const hidden = !trade.agreed_amount || trade.status === "negotiating" || trade.status === "cancelled" || !isParticipant();

    if (hidden) {
        box.style.display = "none";
        feeQuote = null;
        return;
    }

    const quote = await db.rpc("trade_fee_quote", { p_trade_id: tradeId });
    feeQuote = quote.data && quote.data[0] ? quote.data[0] : null;

    if (!feeQuote) {
        box.style.display = "none";
        return;
    }

    const isBuyer = trade.buyer_id === me.id;

    box.innerHTML = "<h4>Payment breakdown</h4>" + feeRows(feeQuote) +
        '<p class="meta">' + (isBuyer
            ? "You pay " + money(feeQuote.amount) + ". There is no extra charge for you. "
            : "The buyer pays " + money(feeQuote.amount) + ". ") +
        "LBN's fee is only charged when payment is made, and it is taken from the seller's side.</p>";
    box.style.display = "block";
}

function startPayment() {
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
        callback: function (response) {
            localStorage.setItem("lbn_pay_" + tradeId, response.reference);
            verifyPayment(response.reference, 1);
        },
        onClose: function () {}
    });

    handler.openIframe();
}

// The buyer sees exactly what is charged and what the seller receives, then confirms
document.getElementById("payBtn").addEventListener("click", async function () {
    await updateFeeUI();

    // If the fee file has not been run yet, payment still works as before
    if (!feeQuote) {
        startPayment();
        return;
    }

    const old = document.getElementById("payConfirm");
    if (old) old.remove();

    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.id = "payConfirm";
    sheet.style.display = "flex";

    sheet.innerHTML =
        '<div class="sheet-card"><div class="sheet-head"><strong>Confirm your payment</strong>' +
        '<button type="button" class="plain-btn" data-pay="cancel">Cancel</button></div>' +
        '<div class="fee-box">' + feeRows(feeQuote) + "</div>" +
        (typeof PAYSTACK_PUBLIC_KEY !== "undefined" && String(PAYSTACK_PUBLIC_KEY).indexOf("pk_test_") === 0
            ? '<p class="notice">Test mode: no real money is charged.</p>' : "") +
        '<p class="meta">You pay <strong>' + money(feeQuote.amount) + "</strong> in total. The LBN fee comes out of the seller's payment, so nothing extra is added for you.</p>" +
        '<p class="meta">LBN holds the money until you and the seller both confirm, or the LBN team settles a dispute.</p>' +
        '<button type="button" class="contact-btn" style="width:100%;" data-pay="go">Pay ' + money(feeQuote.amount) + "</button></div>";

    document.body.appendChild(sheet);

    sheet.addEventListener("click", function (event) {
        const choice = event.target.closest("[data-pay]");

        if (event.target === sheet || (choice && choice.dataset.pay === "cancel")) {
            sheet.remove();
        } else if (choice && choice.dataset.pay === "go") {
            sheet.remove();
            startPayment();
        }
    });
});

// ---------- Disputes with evidence ----------

let disputeFormOpen = false;
let evidenceTick = 0;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

const CATEGORY_TEXT = {
    not_delivered: "Not delivered on time",
    not_as_described: "Not as described",
    poor_quality: "Poor quality or incomplete",
    no_response: "The other person stopped replying",
    other: "Other problem"
};

function niceDate(value) {
    return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function disputeNote(text, ok) {
    const box = document.getElementById("disputeMsg");
    box.textContent = text;
    box.className = "msg " + (ok ? "ok" : "error");
}

function buildCategories() {
    const isBuyer = trade.buyer_id === me.id;
    const overdue = trade.deliver_by && new Date(trade.deliver_by) < new Date();
    const keys = isBuyer ? ["not_delivered", "not_as_described", "poor_quality", "no_response", "other"] : ["no_response", "other"];

    const select = document.getElementById("disputeCategory");
    select.innerHTML = keys.map(function (k) {
        return '<option value="' + k + '">' + CATEGORY_TEXT[k] + "</option>";
    }).join("");

    if (isBuyer && overdue) select.value = "not_delivered";
}

function updateDisputeUI() {
    if (!trade || !me) return;

    const status = trade.status;
    const isBuyer = trade.buyer_id === me.id;

    // The agreed delivery date
    const note = document.getElementById("deadlineNote");

    if (trade.deliver_by && (status === "agreed" || status === "paid") && isParticipant()) {
        const overdue = new Date(trade.deliver_by) < new Date();
        note.style.display = "block";
        note.textContent = overdue
            ? (isBuyer
                ? "The agreed delivery date (" + niceDate(trade.deliver_by) + ") has passed and the seller has not delivered. You can open a dispute."
                : "The agreed delivery date (" + niceDate(trade.deliver_by) + ") has passed. Please deliver now, or tell the buyer what is happening.")
            : "Deliver by " + niceDate(trade.deliver_by) + ".";
    } else {
        note.style.display = "none";
    }

    const inDispute = status === "disputed";
    const panel = document.getElementById("disputePanel");

    panel.style.display = isParticipant() && (inDispute || disputeFormOpen) ? "block" : "none";
    document.getElementById("disputeForm").style.display = disputeFormOpen && !inDispute ? "block" : "none";
    document.getElementById("evidenceBox").style.display = inDispute ? "block" : "none";

    if (inDispute) {
        loadDisputeSummary();
        loadEvidence();
    } else {
        document.getElementById("disputeSummary").innerHTML = "";
    }
}

async function loadDisputeSummary() {
    const { data } = await db
        .from("disputes")
        .select("reason, category, created_at, opened_by")
        .eq("trade_id", tradeId)
        .order("created_at", { ascending: false })
        .limit(1);

    const d = data && data[0];
    if (!d) return;

    document.getElementById("disputeSummary").innerHTML =
        '<p class="notice">This trade is in dispute. The LBN team will read this chat, look at the evidence and decide. It cannot be completed until they do.</p>' +
        "<p><strong>" + escapeHTML(CATEGORY_TEXT[d.category] || "Dispute") + "</strong> opened by " +
        escapeHTML(d.opened_by === me.id ? "you" : nameFor(d.opened_by)) + " on " + niceDate(d.created_at) + "</p>" +
        "<p>" + escapeHTML(d.reason) + "</p>";
}

async function loadEvidence() {
    const list = document.getElementById("evidenceList");
    const { data, error } = await db.rpc("dispute_evidence_list", { p_trade_id: tradeId });

    if (error) {
        list.innerHTML = "<p class='meta'>Could not load the evidence.</p>";
        return;
    }

    if (data.length === 0) {
        list.innerHTML = "<p class='meta'>No evidence has been added yet.</p>";
        return;
    }

    const items = await Promise.all(data.map(async function (e) {
        const signed = await db.storage.from("dispute-evidence").createSignedUrl(e.file_path, 3600);
        const url = signed.data ? signed.data.signedUrl : "";
        const isImage = /\.(jpe?g|png|webp)$/i.test(e.file_path);

        return '<div class="evidence-item">' +
            (isImage && url
                ? '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener"><img src="' + escapeHTML(url) + '" alt="Evidence"></a>'
                : '<a class="btn btn-outline" href="' + escapeHTML(url) + '" target="_blank" rel="noopener">Open ' + escapeHTML(e.file_name) + "</a>") +
            '<p class="meta">From ' + escapeHTML(e.added_by === me.id ? "you" : (e.added_by_name || "the other person")) + ", " + niceDate(e.created_at) + "</p>" +
            (e.note ? "<p>" + escapeHTML(e.note) + "</p>" : "") + "</div>";
    }));

    list.innerHTML = '<div class="evidence-grid">' + items.join("") + "</div>";
}

// Uploads the files, then records each one against the dispute. Returns how many failed.
async function uploadEvidence(files, note) {
    let failed = 0;

    for (const file of files) {
        const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const unique = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        const path = tradeId + "/" + me.id + "/" + unique + "." + extension;

        const upload = await db.storage.from("dispute-evidence").upload(path, file, { contentType: file.type });

        if (upload.error) {
            failed++;
            continue;
        }

        const saved = await db.rpc("add_dispute_evidence", { p_trade_id: tradeId, p_path: path, p_name: file.name, p_note: note || null });
        if (saved.error) failed++;
    }

    return failed;
}

function checkFiles(files) {
    if (files.length > 5) return "Please choose up to 5 files at a time.";

    for (const file of files) {
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") return "Evidence must be photos or a PDF.";
        if (file.size > MAX_EVIDENCE_BYTES) return file.name + " is bigger than 5 MB.";
    }

    return "";
}

document.getElementById("disputeBtn").addEventListener("click", function () {
    disputeFormOpen = !disputeFormOpen;
    buildCategories();
    updateDisputeUI();

    if (disputeFormOpen) document.getElementById("disputePanel").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("disputeCancel").addEventListener("click", function () {
    disputeFormOpen = false;
    updateDisputeUI();
});

document.getElementById("disputeForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const files = Array.from(document.getElementById("disputeFiles").files);
    const problem = checkFiles(files);

    if (problem) {
        disputeNote(problem, false);
        return;
    }

    const button = document.getElementById("disputeSubmit");
    button.disabled = true;
    disputeNote("Opening the dispute...", true);

    const { error } = await db.rpc("open_dispute", {
        p_trade_id: tradeId,
        p_category: document.getElementById("disputeCategory").value,
        p_reason: document.getElementById("disputeReason").value
    });

    if (error) {
        button.disabled = false;
        disputeNote(/could not find the function|schema cache/i.test(error.message)
            ? "Disputes need the latest database update. Run supabase-disputes.sql in Supabase."
            : error.message, false);
        return;
    }

    if (files.length > 0) {
        disputeNote("Uploading your evidence...", true);
        const failed = await uploadEvidence(files, "");
        if (failed > 0) disputeNote(failed + " file(s) could not be uploaded. You can add them again below.", false);
    }

    button.disabled = false;
    document.getElementById("disputeForm").reset();
    disputeFormOpen = false;

    if (files.length === 0 || !document.getElementById("disputeMsg").textContent.includes("could not")) disputeNote("");

    await refresh();
});

document.getElementById("addEvidenceBtn").addEventListener("click", async function () {
    const input = document.getElementById("moreFiles");
    const files = Array.from(input.files);

    if (files.length === 0) {
        disputeNote("Choose a photo or PDF first.", false);
        return;
    }

    const problem = checkFiles(files);

    if (problem) {
        disputeNote(problem, false);
        return;
    }

    const button = document.getElementById("addEvidenceBtn");
    button.disabled = true;
    disputeNote("Uploading...", true);

    const failed = await uploadEvidence(files, document.getElementById("moreNote").value.trim());

    button.disabled = false;
    input.value = "";
    document.getElementById("moreNote").value = "";

    disputeNote(failed > 0 ? failed + " file(s) could not be uploaded." : "Evidence added.", failed === 0);
    await loadEvidence();
});

// New evidence from the other person appears while the chat is open
setInterval(function () {
    if (trade && trade.status === "disputed" && !document.hidden && ++evidenceTick % 4 === 0) loadEvidence();
}, 5000);

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();


// ---------- Reviews ----------

let reviewStars = 0;

async function loadPartnerRating() {
    const chip = document.getElementById("partnerRating");
    if (!chip || !trade || !me || trade.buyer_id !== me.id) return;

    const { data } = await db.rpc("member_ratings", { p_users: [trade.seller_id] });
    const r = data && data[0];

    chip.textContent = "Seller: " + (r && r.review_count > 0 ? ratingLine(r.avg_rating, r.review_count) : "no reviews yet");
}

async function loadReview() {
    const panel = document.getElementById("reviewPanel");
    if (!panel) return;

    const closed = trade && (trade.status === "completed" || trade.status === "settled");

    if (!closed || !me || !isParticipant()) {
        panel.style.display = "none";
        return;
    }

    const { data, error } = await db.rpc("my_trade_review", { p_trade_id: tradeId });
    const r = data && data[0];

    if (error || !r) {
        panel.style.display = "none";
        return;
    }

    const other = trade.buyer_id === me.id ? "the seller" : "the buyer";
    const body = document.getElementById("reviewBody");
    let html = "";

    if (r.can_review) {
        reviewStars = 0;
        html = '<p>How was your trade with ' + other + "?</p>" +
            '<div class="star-row" id="starRow">' +
            [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="star-btn" data-v="' + n + '" aria-label="' + n + ' stars">\u2606</button>'; }).join("") +
            "</div>" +
            '<textarea id="reviewComment" maxlength="500" placeholder="Say a little about it (required for 1 or 2 stars)"></textarea>' +
            '<button type="button" id="reviewSubmit" class="contact-btn">Send my review</button>' +
            '<p class="meta">Your review is public on ' + other + "'s profile. Please be fair and honest. Do not share phone numbers or links.</p>";
    } else if (r.mine_rating) {
        html = "<p>You rated " + other + ' <span class="stars">' + starText(r.mine_rating) + "</span></p>" +
            (r.mine_comment ? "<p>" + escapeHTML(r.mine_comment) + "</p>" : "") +
            (r.theirs_reply ? "<p class='meta'>Their reply: " + escapeHTML(r.theirs_reply) + "</p>" : "");
    } else {
        html = "<p class='meta'>The time to review this trade has ended.</p>";
    }

    if (r.theirs_rating) {
        html += '<hr><p>' + (trade.buyer_id === me.id ? "The seller" : "The buyer") + ' rated you <span class="stars">' + starText(r.theirs_rating) + "</span></p>" +
            (r.theirs_comment ? "<p>" + escapeHTML(r.theirs_comment) + "</p>" : "");
    }

    body.innerHTML = html;
    panel.style.display = "block";
}

document.getElementById("reviewBody").addEventListener("click", async function (event) {
    const star = event.target.closest(".star-btn");

    if (star) {
        reviewStars = parseInt(star.dataset.v, 10);

        document.querySelectorAll("#starRow .star-btn").forEach(function (b) {
            const on = parseInt(b.dataset.v, 10) <= reviewStars;
            b.textContent = on ? "\u2605" : "\u2606";
            b.classList.toggle("on", on);
        });
        return;
    }

    if (event.target.closest("#reviewSubmit")) {
        const msg = document.getElementById("reviewMsg");

        if (reviewStars < 1) {
            msg.textContent = "Tap the stars to choose a rating.";
            msg.className = "msg error";
            return;
        }

        const { error } = await db.rpc("submit_review", {
            p_trade_id: tradeId,
            p_rating: reviewStars,
            p_comment: document.getElementById("reviewComment").value
        });

        msg.textContent = error ? error.message : "Thank you for your review.";
        msg.className = "msg " + (error ? "error" : "ok");

        if (!error) await loadReview();
    }
});


// ---------- Confirming a payment (with retries) ----------

async function verifyPayment(reference, attempt) {
    showNote("Payment received. Confirming it with Paystack (try " + attempt + " of 6)...", "ok");

    const result = await confirmPayment(reference);
    await refresh();

    if (trade && trade.status !== "agreed") {
        localStorage.removeItem("lbn_pay_" + tradeId);
        showNote("Payment confirmed. LBN is holding the money until you confirm the trade is complete.", "ok");
        return;
    }

    if (attempt < 6) {
        setTimeout(function () { verifyPayment(reference, attempt + 1); }, 4000);
        return;
    }

    showNote("We could not confirm your payment yet. Your money is safe. Tap Check my payment in a minute, or contact us with this reference: " +
        reference + (result && result.message ? " (" + result.message + ")" : ""), "error");
}

document.getElementById("checkPayBtn").addEventListener("click", function () {
    let reference = localStorage.getItem("lbn_pay_" + tradeId);

    if (!reference) {
        reference = prompt("Enter the payment reference from Paystack. It starts with TRD-");
        if (!reference) return;
    }

    verifyPayment(reference.trim(), 1);
});

// ---------- Live updates for both people ----------

try {
    db.channel("trade-live-" + tradeId)
        .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: "id=eq." + tradeId }, function () { refresh(); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "trade_messages", filter: "trade_id=eq." + tradeId }, function () { refresh(); })
        .subscribe();
} catch (error) {}

// ---------- Where is the trade? A simple step tracker ----------

function renderSteps() {
    const box = document.getElementById("tradeSteps");
    if (!box || !trade) return;

    const status = trade.status;

    if (status === "negotiating" || status === "cancelled" || status === "refunded") {
        box.style.display = "none";
        return;
    }

    // How far along is it? 1 agreed, 2 paid, 3 delivered, 4 both confirmed, 5 reviews
    let reached = status === "agreed" ? 1 : status === "paid" ? 2 : status === "delivered" ? 3 : status === "disputed" ? (trade.paid_at ? 2 : 1) : 5;
    const bothConfirmed = status === "completed" || status === "settled";
    const labels = ["Deal agreed", "Paid, held by LBN", "Delivered", "Both confirm", "Review"];

    box.innerHTML = labels.map(function (label, i) {
        const n = i + 1;
        const cls = n <= reached && !(n === 5 && !bothConfirmed) ? "done" : n === reached + 1 ? "next" : "";
        return '<div class="step ' + cls + '"><span class="step-dot">' + (cls === "done" ? "\u2713" : n) + "</span><span>" + label + "</span></div>";
    }).join("");

    box.style.display = "flex";
}

// What happens to the money, in plain words
function renderMoneyState() {
    const box = document.getElementById("moneyState");
    if (!box || !trade || !me || !isParticipant()) return;

    const isSeller = trade.seller_id === me.id;
    const isBuyer = trade.buyer_id === me.id;
    const naira = function (n) { return "\u20A6" + Number(n || 0).toLocaleString(); };
    let text = "";

    if ((trade.status === "paid" || trade.status === "delivered") && trade.paid_at) {
        text = isSeller
            ? naira(trade.seller_amount) + " is being held by LBN for you. You receive it after you and the buyer both confirm the trade is complete."
            : "Your " + naira(trade.agreed_amount) + " is held safely by LBN until you confirm the trade is complete.";
    } else if ((trade.status === "completed" || trade.status === "settled") && isSeller && trade.payout_status === "due") {
        text = "Trade complete. LBN is paying " + naira(trade.seller_amount) + " to your bank account. You get a notification when it is sent. Make sure your bank details are saved in your Dashboard.";
    } else if ((trade.status === "completed" || trade.status === "settled") && isSeller && trade.payout_status === "paid") {
        text = "LBN has paid " + naira(trade.seller_amount) + " to your bank account.";
    } else if ((trade.status === "refunded" || trade.status === "settled") && isBuyer && trade.refund_status === "due") {
        text = "Your refund of " + naira(trade.refund_amount || trade.agreed_amount) + " is being processed. You get a notification when it is sent.";
    } else if ((trade.status === "refunded" || trade.status === "settled") && isBuyer && trade.refund_status === "done") {
        text = "LBN has refunded " + naira(trade.refund_amount || trade.agreed_amount) + " to you.";
    }

    box.textContent = text;
    box.style.display = text ? "block" : "none";
}