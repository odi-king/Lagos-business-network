// LBN Phase 9D: "Ship to another city or state" on a purchase. Works with supabase-courier.sql.
// Uses these from trade.js: db, trade, me, tradeId. It tells trade.js how much extra to charge (window.lbnShipFee)
// or why payment must wait (window.lbnShipBlock).

(function () {
    const box = document.getElementById("shipBox");
    if (!box || typeof db === "undefined" || !db) return;

    let states = null;
    let info = null;
    let lastSig = "";
    let formOpen = false;
    let busy = false;

    window.lbnShipFee = 0;
    window.lbnShipBlock = "";

    function esc(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    function naira(n) { return "₦" + Number(n || 0).toLocaleString(); }

    function stateOptions(selected) {
        return '<option value="" disabled' + (selected ? "" : " selected") + ">Choose the state</option>" +
            (states || []).map(function (s) {
                return '<option value="' + esc(s) + '"' + (s === selected ? " selected" : "") + ">" + esc(s) + "</option>";
            }).join("");
    }

    function msgLine(text, ok) {
        const m = box.querySelector(".ship-msg");
        if (!m) return;
        m.className = "msg ship-msg " + (ok ? "ok" : "error");
        m.textContent = text || "";
    }

    function form(isBuyer) {
        const mine = (info && info.mine) || {};
        const hasMine = !!mine.address;

        return '<form class="ship-form">' +
            '<select name="state" required>' + stateOptions(hasMine ? mine.state : "") + "</select>" +
            '<input type="text" name="city" maxlength="60" placeholder="City or town" value="' + esc(hasMine ? mine.city : "") + '" required>' +
            '<input type="text" name="address" maxlength="200" placeholder="' + (isBuyer ? "Full delivery address (house number, street, landmark)" : "Full pickup address (house number, street, landmark)") + '" value="' + esc(hasMine ? mine.address : "") + '" required>' +
            '<input type="tel" name="phone" maxlength="20" placeholder="Phone number the courier can call" value="' + esc(hasMine ? mine.phone : "") + '" required>' +
            (isBuyer ? '<input type="text" name="note" maxlength="200" placeholder="Note for the courier (optional)" value="' + esc(mine.note) + '">' : "") +
            '<p class="meta">' + (isBuyer ? "Only the LBN team sees your full address. The seller sees your state and city only." : "Only the LBN team sees this address. The buyer sees your state and city only.") + "</p>" +
            '<button type="submit" class="contact-btn">Save</button> ' +
            '<button type="button" class="plain-btn" data-ship="close">Cancel</button>' +
            '<p class="msg ship-msg"></p></form>';
    }

    function render() {
        window.lbnShipFee = 0;
        window.lbnShipBlock = "";

        if (!trade || !me) { box.style.display = "none"; return; }

        const isBuyer = trade.buyer_id === me.id;
        const isSeller = trade.seller_id === me.id;
        const beforePay = trade.status === "negotiating" || trade.status === "agreed";

        if (!isBuyer && !isSeller) { box.style.display = "none"; return; }

        let html = "<h4>Shipping to another city or state</h4>";

        if (!info) {
            if (!(isBuyer && beforePay && trade.agreed_amount !== null)) { box.style.display = "none"; return; }

            html += formOpen
                ? "<p class='meta'>Where should the item be sent?</p>" + form(true)
                : '<p class="meta">Buying from another city or state? LBN books a courier. You see the shipping price before you pay, and LBN holds the fee until the item is delivered.</p>' +
                  '<button type="button" class="btn btn-outline" data-ship="open">Ship by courier</button><p class="msg ship-msg"></p>';

            box.innerHTML = html;
            box.style.display = "block";
            return;
        }

        const status = info.status;

        if (!info.paid && status !== "cancelled") {
            const route = esc(info.pickup_city ? info.pickup_city + ", " + info.pickup_state : "waiting for the seller") + " → " + esc(info.dest_city + ", " + info.dest_state);

            if (isBuyer) {
                html += "<p class='meta'>Route: <strong>" + route + "</strong></p>";

                if (status === "ready") {
                    window.lbnShipFee = Number(info.fee);
                    html += "<p><strong>Shipping fee: " + naira(info.fee) + "</strong>" + (info.eta ? " (about " + esc(info.eta) + ")" : "") +
                        ". You pay " + naira(trade.agreed_amount + Number(info.fee)) + " in total (item " + naira(trade.agreed_amount) + " + shipping).</p>";
                } else if (status === "quoted") {
                    window.lbnShipBlock = "Accept the shipping price first (or remove shipping) before paying.";
                    html += "<p><strong>Shipping price: " + naira(info.fee) + "</strong>" + (info.eta ? " (about " + esc(info.eta) + ")" : "") + ".</p>" +
                        '<button type="button" class="contact-btn" data-ship="accept">Accept this price</button> ';
                } else {
                    window.lbnShipBlock = info.pickup_city
                        ? "The LBN team is working out the shipping price. You can pay when it shows here, or remove shipping."
                        : "Waiting for the seller to give the pickup place. You can pay when the shipping price shows here, or remove shipping.";
                    html += '<p class="notice">' + esc(window.lbnShipBlock) + "</p>";
                }

                html += formOpen ? form(true) :
                    '<button type="button" class="btn btn-outline" data-ship="open">Change my address</button> ' +
                    '<button type="button" class="delete-btn" data-ship="remove">Remove shipping</button><p class="msg ship-msg"></p>';
            } else {
                html += "<p class='meta'>The buyer asked for shipping to <strong>" + esc(info.dest_city + ", " + info.dest_state) + "</strong>.</p>";

                if (info.mine && info.mine.address) {
                    html += "<p class='meta'>Pickup: <strong>" + esc(info.pickup_city + ", " + info.pickup_state) + "</strong>" +
                        (status === "requested" ? ". The LBN team is working out the price." : status === "quoted" ? ". Price " + naira(info.fee) + " is waiting for the buyer." : ". Shipping fee " + naira(info.fee) + " (paid by the buyer).") + "</p>";
                } else {
                    html += '<p class="notice">Please give the place where the courier will collect the item.</p>';
                }

                html += formOpen || !(info.mine && info.mine.address) ? form(false) :
                    '<button type="button" class="btn btn-outline" data-ship="open">Change the pickup place</button><p class="msg ship-msg"></p>';
            }

            box.innerHTML = html;
            box.style.display = "block";
            return;
        }

        if (status === "cancelled") {
            html += info.refund_status === "due"
                ? "<p class='notice'>Shipping was cancelled. The shipping fee of " + naira(info.fee) + " is being refunded to the buyer.</p>"
                : info.refund_status === "done" ? "<p class='meta'>Shipping was cancelled and the shipping fee was refunded.</p>" : "<p class='meta'>Shipping was cancelled.</p>";
        } else {
            const text = {
                paid: "Shipping is paid. LBN is booking a courier.",
                booked: "A courier is booked and will collect the item.",
                shipped: "The courier has the item and it is on the way.",
                delivered: "Delivered."
            }[status] || "";

            html += "<p><strong>" + esc(text) + "</strong> " + esc(info.pickup_city + ", " + info.pickup_state) + " → " + esc(info.dest_city + ", " + info.dest_state) + "</p>";

            if (info.courier) {
                html += "<p class='meta'>Courier: <strong>" + esc(info.courier) + "</strong> • Tracking number: <strong>" + esc(info.tracking_no) + "</strong>" +
                    (info.tracking_url ? ' • <a href="' + esc(info.tracking_url) + '" target="_blank" rel="noopener" style="color: var(--accent);">Track the parcel</a>' : "") + "</p>";
            }
        }

        box.innerHTML = html;
        box.style.display = "block";
    }

    async function refresh(force) {
        if (busy || typeof trade === "undefined" || !trade || typeof me === "undefined" || !me) return;
        busy = true;

        try {
            const result = await db.rpc("my_trade_shipment", { p_trade: tradeId });

            if (result.error) {
                // The database file has not been run yet: stay hidden so trades work exactly as before
                info = null;
                box.style.display = "none";
                return;
            }

            info = result.data;

            if (states === null) {
                const s = await db.rpc("shipping_states");
                states = s.data || [];
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
        const b = event.target.closest("[data-ship]");
        if (!b) return;

        if (b.dataset.ship === "open") { formOpen = true; lastSig = ""; render(); return; }
        if (b.dataset.ship === "close") { formOpen = false; lastSig = ""; render(); return; }

        if (b.dataset.ship === "accept") {
            const { data, error } = await db.rpc("buyer_accept_shipment", { p_trade: tradeId });
            if (error || (data && data.ok === false)) { msgLine(error ? error.message : data.message, false); return; }
            lastSig = "";
            refresh(true);
            return;
        }

        if (b.dataset.ship === "remove") {
            if (!confirm("Remove shipping from this purchase?")) return;
            const { error } = await db.rpc("buyer_cancel_shipment", { p_trade: tradeId });
            if (error) { msgLine(error.message, false); return; }
            info = null;
            formOpen = false;
            lastSig = "";
            refresh(true);
        }
    });

    box.addEventListener("submit", async function (event) {
        if (!event.target.classList.contains("ship-form")) return;
        event.preventDefault();

        const f = event.target;
        const isBuyer = trade.buyer_id === me.id;
        const submit = f.querySelector("button[type=submit]");
        submit.disabled = true;

        const result = isBuyer
            ? await db.rpc("buyer_request_shipment", {
                p_trade: tradeId, p_state: f.state.value, p_city: f.city.value, p_address: f.address.value, p_phone: f.phone.value, p_note: f.note ? f.note.value : ""
            })
            : await db.rpc("seller_set_shipment_pickup", {
                p_trade: tradeId, p_state: f.state.value, p_city: f.city.value, p_address: f.address.value, p_phone: f.phone.value
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

    refresh(true);
    setInterval(function () { if (!document.hidden) refresh(false); }, 4000);
    setTimeout(function () { refresh(true); }, 1500);
})();