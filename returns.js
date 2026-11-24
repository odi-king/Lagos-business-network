// LBN Phase 6A: returns inside the trade chat.
// Works together with trade.js (it uses trade, me, tradeId, escapeHTML, niceDate, checkFiles, refresh)
// and with supabase-returns.sql.

let returnData = null;
let returnSignature = "";
let returnFormOpen = false;

const RETURN_REASONS = {
    wrong_item: "Wrong item received",
    damaged_faulty: "Damaged or faulty",
    not_as_described: "Not as described",
    incomplete: "Parts missing or incomplete"
};

function returnNote(text, ok) {
    const box = document.getElementById("returnMsg");
    box.textContent = text;
    box.className = "msg " + (ok ? "ok" : "error");
}

function returnFriendlyError(error) {
    const text = error && error.message ? error.message : "Something went wrong.";
    return /could not find the function|schema cache/i.test(text)
        ? "Returns need the latest database update. Run supabase-returns.sql in Supabase."
        : text;
}

// Reads the return from the database. trade.js calls this every time the chat refreshes.
async function loadReturn() {
    if (!trade || !me || !isParticipant()) return;

    const result = await db.rpc("trade_return_get", { p_trade_id: tradeId });

    // The database update has not been run yet: the return screen stays hidden
    returnData = result.error ? null : result.data;

    const signature = JSON.stringify([returnData, trade.status, trade.buyer_confirmed_at, returnFormOpen]);
    if (signature === returnSignature) return;

    returnSignature = signature;
    renderReturn();
}

function renderReturn() {
    const isBuyer = trade.buyer_id === me.id;
    const isSeller = trade.seller_id === me.id;
    const r = returnData;
    const active = !!(r && r.active) && trade.status === "delivered";
    const canAsk = isBuyer && !isService() && trade.status === "delivered" && !trade.buyer_confirmed_at && !active;

    document.getElementById("returnBtn").style.display = canAsk ? "" : "none";

    // While a return is open nobody can complete the trade
    if (active) {
        document.getElementById("receivedBtn").style.display = "none";
        document.getElementById("sellerDoneBtn").style.display = "none";
    }

    const panel = document.getElementById("returnPanel");
    const showForm = canAsk && returnFormOpen;

    panel.style.display = active || showForm ? "block" : "none";
    document.getElementById("returnForm").style.display = showForm ? "block" : "none";

    const summary = document.getElementById("returnSummary");
    const actions = document.getElementById("returnActions");
    const evidence = document.getElementById("returnEvidence");

    if (!active) {
        summary.innerHTML = "";
        actions.innerHTML = "";
        evidence.style.display = "none";
        return;
    }

    let text = "";
    let buttons = "";

    if (r.status === "requested") {
        if (isBuyer) {
            text = "You asked to return this item. Waiting for the seller to accept or decline by " + niceDate(r.respond_by) + ".";
            buttons = '<button type="button" class="plain-btn" data-act="cancel">Drop the return</button>';
            if (r.can_escalate) {
                text += " The seller has not answered in time, so you can send this to the LBN team.";
                buttons += ' <button type="button" class="delete-btn" data-act="escalate">Send to the LBN team</button>';
            }
        } else {
            text = "The buyer wants to return this item. Please accept or decline by " + niceDate(r.respond_by) + ".";
            buttons =
                '<input type="text" id="returnSellerNote" maxlength="300" placeholder="Note to the buyer (needed if you decline)">' +
                '<button type="button" class="contact-btn" data-act="accept">Accept the return</button> ' +
                '<button type="button" class="delete-btn" data-act="decline">Decline the return</button>';
        }
    } else if (r.status === "accepted") {
        if (isBuyer) {
            text = "The seller accepted the return. Send the item back by " + niceDate(r.ship_by) + ", then add the courier and tracking number.";
            buttons =
                '<input type="text" id="returnCarrier" maxlength="40" placeholder="Courier name, for example GIG Logistics">' +
                '<input type="text" id="returnTracking" maxlength="40" placeholder="Tracking number">' +
                '<button type="button" class="contact-btn" data-act="ship">I sent it back</button> ' +
                '<button type="button" class="plain-btn" data-act="cancel">Drop the return</button>';
        } else {
            text = "You accepted the return. Waiting for the buyer to send the item back by " + niceDate(r.ship_by) + ".";
        }
    } else if (r.status === "declined") {
        if (isBuyer) {
            text = "The seller declined the return" + (r.seller_note ? ": " + r.seller_note : ".") + " You can drop the return, or send it to the LBN team to decide.";
            buttons =
                '<button type="button" class="delete-btn" data-act="escalate">Send to the LBN team</button> ' +
                '<button type="button" class="plain-btn" data-act="cancel">Drop the return</button>';
        } else {
            text = "You declined the return. The buyer can drop it or send it to the LBN team to decide.";
        }
    } else if (r.status === "shipped") {
        const trackLine = "with " + (r.carrier || "a courier") + ", tracking number " + (r.tracking_number || "");

        if (isBuyer) {
            text = "You sent the item back " + trackLine + ". Waiting for the seller to confirm it arrived by " + niceDate(r.confirm_by) + ".";
            if (r.can_escalate) {
                text += " The seller has not confirmed in time, so you can send this to the LBN team.";
                buttons = '<button type="button" class="delete-btn" data-act="escalate">Send to the LBN team</button>';
            }
        } else {
            text = "The buyer sent the item back " + trackLine + ". When it arrives, confirm it below by " + niceDate(r.confirm_by) + ". The buyer is then refunded.";
            buttons = '<button type="button" class="contact-btn" data-act="received">The item arrived: refund the buyer</button>';
        }
    }

    summary.innerHTML =
        '<p class="notice">The money stays on hold with LBN while the return is open. The trade cannot be completed until it is settled.</p>' +
        "<p><strong>" + escapeHTML(RETURN_REASONS[r.reason] || r.reason_text || "Return") + "</strong></p>" +
        "<p>" + escapeHTML(r.details) + "</p>" +
        "<p>" + escapeHTML(text) + "</p>";

    actions.innerHTML = buttons;
    evidence.style.display = "block";
    loadReturnPhotos();
}

// ---------- Photos ----------

async function loadReturnPhotos() {
    const list = document.getElementById("returnPhotoList");
    const { data, error } = await db.rpc("dispute_evidence_list", { p_trade_id: tradeId });

    if (error) {
        list.innerHTML = "<p class='meta'>Could not load the photos.</p>";
        return;
    }

    if (data.length === 0) {
        list.innerHTML = "<p class='meta'>No photos yet.</p>";
        return;
    }

    const items = await Promise.all(data.map(async function (e) {
        const signed = await db.storage.from("dispute-evidence").createSignedUrl(e.file_path, 3600);
        const url = signed.data ? signed.data.signedUrl : "";
        const isImage = /\.(jpe?g|png|webp)$/i.test(e.file_path);

        return '<div class="evidence-item">' +
            (isImage && url
                ? '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener"><img src="' + escapeHTML(url) + '" alt="Return photo"></a>'
                : '<a class="btn btn-outline" href="' + escapeHTML(url) + '" target="_blank" rel="noopener">Open ' + escapeHTML(e.file_name) + "</a>") +
            '<p class="meta">From ' + escapeHTML(e.added_by === me.id ? "you" : (e.added_by_name || "the other person")) + ", " + niceDate(e.created_at) + "</p>" +
            (e.note ? "<p>" + escapeHTML(e.note) + "</p>" : "") + "</div>";
    }));

    list.innerHTML = '<div class="evidence-grid">' + items.join("") + "</div>";
}

// Uploads the files, then records each one against the return. Returns how many failed.
async function uploadReturnPhotos(files, note) {
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

        const saved = await db.rpc("add_return_evidence", { p_trade_id: tradeId, p_path: path, p_name: file.name, p_note: note || null });
        if (saved.error) failed++;
    }

    return failed;
}

// ---------- Buttons and forms ----------

async function reloadAfterReturnAction() {
    returnSignature = "";
    await refresh();
    await loadReturn();
}

document.getElementById("returnBtn").addEventListener("click", function () {
    returnFormOpen = !returnFormOpen;
    returnSignature = "";
    loadReturn();

    if (returnFormOpen) document.getElementById("returnPanel").scrollIntoView({ behavior: "smooth" });
});

document.getElementById("returnCancelForm").addEventListener("click", function () {
    returnFormOpen = false;
    returnSignature = "";
    loadReturn();
});

document.getElementById("returnForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const files = Array.from(document.getElementById("returnFiles").files);
    const problem = checkFiles(files);

    if (problem) {
        returnNote(problem, false);
        return;
    }

    const button = document.getElementById("returnSubmit");
    button.disabled = true;
    returnNote("Sending your return request...", true);

    const { error } = await db.rpc("return_request", {
        p_trade_id: tradeId,
        p_reason: document.getElementById("returnReason").value,
        p_details: document.getElementById("returnDetails").value
    });

    if (error) {
        button.disabled = false;
        returnNote(returnFriendlyError(error), false);
        return;
    }

    let failed = 0;

    if (files.length > 0) {
        returnNote("Uploading your photos...", true);
        failed = await uploadReturnPhotos(files, "");
    }

    button.disabled = false;
    document.getElementById("returnForm").reset();
    returnFormOpen = false;
    returnNote(failed > 0 ? failed + " photo(s) could not be uploaded. You can add them again below." : "", failed === 0);

    await reloadAfterReturnAction();
});

document.getElementById("returnActions").addEventListener("click", async function (event) {
    const button = event.target.closest("button[data-act]");
    if (!button) return;

    const act = button.dataset.act;
    let call = null;

    if (act === "accept") {
        call = ["return_respond", { p_trade_id: tradeId, p_accept: true, p_note: (document.getElementById("returnSellerNote").value || "").trim() || null }];
    } else if (act === "decline") {
        call = ["return_respond", { p_trade_id: tradeId, p_accept: false, p_note: (document.getElementById("returnSellerNote").value || "").trim() }];
    } else if (act === "cancel") {
        if (!confirm("Drop this return request? The trade will continue as normal.")) return;
        call = ["return_cancel", { p_trade_id: tradeId }];
    } else if (act === "ship") {
        call = ["return_ship", {
            p_trade_id: tradeId,
            p_carrier: (document.getElementById("returnCarrier").value || "").trim(),
            p_tracking: (document.getElementById("returnTracking").value || "").trim()
        }];
    } else if (act === "received") {
        if (!confirm("Confirm the returned item arrived? The trade will close and the buyer will be refunded.")) return;
        call = ["return_confirm_received", { p_trade_id: tradeId }];
    } else if (act === "escalate") {
        if (!confirm("Send this return to the LBN team to decide? The trade will move to a dispute and the money stays on hold.")) return;
        call = ["return_escalate", { p_trade_id: tradeId }];
    }

    if (!call) return;

    button.disabled = true;
    returnNote("Working...", true);

    const { error } = await db.rpc(call[0], call[1]);

    if (error) {
        button.disabled = false;
        returnNote(returnFriendlyError(error), false);
        return;
    }

    returnNote("");
    await reloadAfterReturnAction();
});

document.getElementById("returnAddPhotos").addEventListener("click", async function () {
    const input = document.getElementById("returnMoreFiles");
    const files = Array.from(input.files);

    if (files.length === 0) {
        returnNote("Choose a photo first.", false);
        return;
    }

    const problem = checkFiles(files);

    if (problem) {
        returnNote(problem, false);
        return;
    }

    const button = document.getElementById("returnAddPhotos");
    button.disabled = true;
    returnNote("Uploading...", true);

    const failed = await uploadReturnPhotos(files, document.getElementById("returnMoreNote").value.trim());

    button.disabled = false;
    input.value = "";
    document.getElementById("returnMoreNote").value = "";

    returnNote(failed > 0 ? failed + " photo(s) could not be uploaded." : "Photos added.", failed === 0);
    await loadReturnPhotos();
});

// If the chat finished its first refresh before this file loaded, check for a return now
if (trade) loadReturn();