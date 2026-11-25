// LBN Phase 9A: "Deliver by LBN rider" on a purchase (Lagos). Works with supabase-delivery.sql.
// Uses these from trade.js: db, trade, me, tradeId. It also tells trade.js how much extra to charge
// (window.lbnDeliveryFee) or why payment must wait (window.lbnDeliveryBlock).

(function () {
    const box = document.getElementById("deliveryBox");
    if (!box || typeof db === "undefined" || !db) return;

    let zones = null;
    let info = null;
    let lastSig = "";
    let formOpen = false;
    let busy = false;

    window.lbnDeliveryFee = 0;
    window.lbnDeliveryBlock = "";

    function esc(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function naira(n) { return "₦" + Number(n || 0).toLocaleString(); }

    function zoneOptions(selected) {
        return '<option value="" disabled' + (selected ? "" : " selected") + ">Choose your area</option>" +
            (zones || []).map(function (z) {
                return '<option value="' + esc(z.id) + '"' + (z.id === selected ? " selected" : "") + ">" + esc(z.name) + "</option>";
            }).join("");
    }

    function msgLine(text, ok) {
        const m = box.querySelector(".del-msg");
        if (!m) return;
        m.className = "msg del-msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    function buyerForm() {
        const mine = (info && info.mine) || {};

        return '<form class="del-form">' +
            '<select name="zone" required>' + zoneOptions(mine.zone_id) + "</select>" +
            '<input type="text" name="address" maxlength="200" placeholder="Full delivery address (house number, street, landmark)" value="' + esc(mine.address) + '" required>' +
            '<input type="tel" name="phone" maxlength="20" placeholder="Phone number the rider can call" value="' + esc(mine.phone) + '" required>' +
            '<input type="text" name="note" maxlength="200" placeholder="Note for the rider (optional)" value="' + esc(mine.note) + '">' +
            '<p class="meta">Only the rider will see your address and phone, and only after accepting the job. The seller sees your area only.</p>' +
            '<button type="submit" class="contact-btn">Save delivery details</button> ' +
            '<button type="button" class="plain-btn" data-del="close">Cancel</button>' +
            '<p class="msg del-msg"></p></form>';
    }

    function sellerForm() {
        const mine = (info && info.mine) || {};

        return '<form class="del-form">' +
            '<select name="zone" required>' + zoneOptions(mine.zone_id) + "</select>" +
            '<input type="text" name="address" maxlength="200" placeholder="Full pickup address (house number, street, landmark)" value="' + esc(mine.address) + '" required>' +
            '<input type="tel" name="phone" maxlength="20" placeholder="Phone number the rider can call" value="' + esc(mine.phone) + '" required>' +
            '<p class="meta">Only the rider will see this address, and only after accepting the job. The buyer sees your area only.</p>' +
            '<button type="submit" class="contact-btn">Save pickup place</button> ' +
            '<button type="button" class="plain-btn" data-del="close">Cancel</button>' +
            '<p class="msg del-msg"></p></form>';
    }

    function render() {
        window.lbnDeliveryFee = 0;
        window.lbnDeliveryBlock = "";

        if (!trade || !me) { box.style.display = "none"; return; }

        const isBuyer = trade.buyer_id === me.id;
        const isSeller = trade.seller_id === me.id;
        const beforePay = trade.status === "negotiating" || trade.status === "agreed";

        if (!isBuyer && !isSeller) { box.style.display = "none"; return; }

        let html = "<h4>Delivery by LBN rider (Lagos)</h4>";

        if (!info) {
            // Nothing chosen yet. Only the buyer can start, and only before paying.
            if (!(isBuyer && beforePay && trade.agreed_amount !== null)) { box.style.display = "none"; return; }

            if (formOpen) {
                html += "<p class='meta'>Where should the item be delivered?</p>" + buyerForm();
            } else {
                html += '<p class="meta">Let an LBN rider bring the item to you. The delivery fee is added to your payment and held by LBN until you confirm delivery with your PIN.</p>' +
                    '<button type="button" class="btn btn-outline" data-del="open">Deliver by LBN rider</button><p class="msg del-msg"></p>';
            }

            box.innerHTML = html;
            box.style.display = "block";
            return;
        }

        const status = info.status;
        const paid = info.paid === true;

        if (!paid && status !== "cancelled") {
            // Still being set up
            if (isBuyer) {
                html += "<p class='meta'>Your area: <strong>" + esc(info.drop_zone) + "</strong>. Pickup area: <strong>" + esc(info.pickup_zone || "waiting for the seller") + "</strong>.</p>";

                if (status === "ready") {
                    window.lbnDeliveryFee = Number(info.fee);
                    html += '<p><strong>Delivery fee: ' + naira(info.fee) + "</strong>. You pay " + naira(trade.agreed_amount + Number(info.fee)) + " in total (item " + naira(trade.agreed_amount) + " + delivery).</p>";
                } else if (info.pickup_zone && info.drop_zone) {
                    window.lbnDeliveryBlock = "Delivery between " + info.pickup_zone + " and " + info.drop_zone + " is not available yet. Choose another area or remove delivery before paying.";
                    html += '<p class="msg error">' + esc(window.lbnDeliveryBlock) + "</p>";
                } else {
                    window.lbnDeliveryBlock = "Waiting for the seller to give the pickup place. You can pay when the delivery fee shows here, or remove delivery.";
                    html += '<p class="notice">Waiting for the seller to give the pickup place. You can pay when the delivery fee shows here.</p>';
                }

                html += formOpen ? buyerForm() :
                    '<button type="button" class="btn btn-outline" data-del="open">Change my address</button> ' +
                    '<button type="button" class="delete-btn" data-del="remove">Remove delivery</button><p class="msg del-msg"></p>';
            } else {
                html += "<p class='meta'>The buyer asked for delivery to <strong>" + esc(info.drop_zone) + "</strong>.</p>";

                if (info.mine && info.mine.address) {
                    html += "<p class='meta'>Your pickup area: <strong>" + esc(info.pickup_zone) + "</strong>" + (status === "ready" ? ". Delivery fee " + naira(info.fee) + " (paid by the buyer)." : ".") + "</p>";
                } else {
                    html += '<p class="notice">Please give the place where the rider will collect the item.</p>';
                }

                html += formOpen || !(info.mine && info.mine.address) ? sellerForm() :
                    '<button type="button" class="btn btn-outline" data-del="open">Change the pickup place</button><p class="msg del-msg"></p>';
            }

            box.innerHTML = html;
            box.style.display = "block";
            return;
        }

        // Paid (or cancelled after payment)
        if (status === "cancelled") {
            html += info.refund_status === "due"
                ? "<p class='notice'>This delivery was cancelled. The delivery fee of " + naira(info.fee) + " is being refunded to the buyer.</p>"
                : info.refund_status === "done" ? "<p class='meta'>This delivery was cancelled and the delivery fee was refunded.</p>" : "<p class='meta'>This delivery was cancelled.</p>";
        } else {
            const text = {
                finding_rider: "Waiting for a rider to accept the job.",
                assigned: "A rider is on the way to collect the item.",
                picked_up: "The rider has the item and is on the way.",
                delivered: "Delivered."
            }[status] || "";

            html += "<p><strong>" + esc(text) + "</strong> " + info.pickup_zone + " → " + info.drop_zone + "</p>";

            if (info.pin && status !== "delivered") {
                html += info.role === "seller"
                    ? '<p class="meta">Give the rider this <strong>pickup PIN</strong> when they arrive to collect the item:</p>'
                    : '<p class="meta">Give the rider this <strong>delivery PIN</strong> only when the item is in your hands:</p>';
                html += '<p style="font-size:2rem;font-weight:700;letter-spacing:8px;font-family:monospace;margin:6px 0;">' + esc(info.pin) + "</p>" +
                    '<p class="meta">Never share it in chat or with anyone else.</p>';
            }
        }

        box.innerHTML = html;
        box.style.display = "block";
    }

    async function refresh(force) {
        if (busy || typeof trade === "undefined" || !trade || typeof me === "undefined" || !me) return;
        busy = true;

        try {
            const result = await db.rpc("my_trade_delivery", { p_trade: tradeId });

            if (result.error) {
                // The database file has not been run yet: stay hidden so trades work exactly as before
                info = null;
                box.style.display = "none";
                return;
            }

            info = result.data;

            if (zones === null) {
                const z = await db.rpc("delivery_zones_public");
                zones = z.data || [];
            }

            const sig = JSON.stringify([trade.status, trade.agreed_amount, info, formOpen]);
            if (force || sig !== lastSig) {
                lastSig = sig;
                render();
            }
        } finally {
            busy = false;
        }
    }

    box.addEventListener("click", async function (event) {
        const b = event.target.closest("[data-del]");
        if (!b) return;

        if (b.dataset.del === "open") { formOpen = true; lastSig = ""; render(); return; }
        if (b.dataset.del === "close") { formOpen = false; lastSig = ""; render(); return; }

        if (b.dataset.del === "remove") {
            if (!confirm("Remove delivery from this purchase?")) return;
            const { error } = await db.rpc("buyer_cancel_delivery", { p_trade: tradeId });
            if (error) { msgLine(error.message, false); return; }
            info = null;
            formOpen = false;
            lastSig = "";
            refresh(true);
        }
    });

    box.addEventListener("submit", async function (event) {
        if (!event.target.classList.contains("del-form")) return;
        event.preventDefault();

        const f = event.target;
        const isBuyer = trade.buyer_id === me.id;
        const submit = f.querySelector("button[type=submit]");
        submit.disabled = true;

        const result = isBuyer
            ? await db.rpc("buyer_set_delivery", {
                p_trade: tradeId, p_zone: f.zone.value, p_address: f.address.value, p_phone: f.phone.value, p_note: f.note ? f.note.value : ""
            })
            : await db.rpc("seller_set_pickup", {
                p_trade: tradeId, p_zone: f.zone.value, p_address: f.address.value, p_phone: f.phone.value
            });

        submit.disabled = false;

        if (result.error || !result.data || result.data.ok === false) {
            msgLine(result.error ? result.error.message : (result.data && result.data.message) || "Could not save", false);
            return;
        }

        formOpen = false;
        lastSig = "";
        refresh(true);
    });

    // trade.js loads the trade a moment after the page opens, and it changes as people act
    refresh(true);
    setInterval(function () { if (!document.hidden) refresh(false); }, 4000);
    setTimeout(function () { refresh(true); }, 1500);
})();