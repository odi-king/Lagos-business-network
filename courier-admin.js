// LBN Phase 9D: the admin's "Shipping to other cities" panel (Finance permission). Works with supabase-courier.sql.
// Uses escapeHTML and db from admin.js.

(function () {
    const list = document.getElementById("shipList");
    const filter = document.getElementById("shipFilter");
    const msg = document.getElementById("shipMsg");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    function naira(n) { return "₦" + Number(n || 0).toLocaleString(); }

    function say(text, ok) {
        msg.textContent = text || "";
        msg.className = "msg " + (ok ? "ok" : "error");
    }

    function place(city, state, address, phone) {
        return escapeHTML(city + ", " + state) + (address ? " • " + escapeHTML(address) : "") + (phone ? " • " + escapeHTML(phone) : "");
    }

    async function load() {
        const { data, error } = await db.rpc("admin_shipments", { p_status: filter.value });

        if (error) { list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-courier.sql in Supabase.</p>"; return; }

        list.innerHTML = (data || []).map(function (s) {
            const id = escapeHTML(s.id);
            let action = "";

            if (s.status === "requested" || s.status === "quoted") {
                action = s.pickup_address
                    ? '<div class="filters"><input type="number" min="500" max="5000000" data-fee placeholder="Price in naira" value="' + (s.fee || "") + '">' +
                      '<input type="text" maxlength="60" data-eta placeholder="Delivery time, e.g. 2 to 4 days" value="">' +
                      '<button type="button" class="contact-btn" data-quote="' + id + '">' + (s.status === "quoted" ? "Change the price" : "Send price to the buyer") + "</button></div>"
                    : '<p class="meta">Waiting for the seller to give the pickup place before you can price it.</p>';
            } else if (s.status === "paid" || s.status === "booked") {
                action = '<div class="filters"><input type="text" maxlength="60" data-courier placeholder="Courier name" value="' + escapeHTML(s.courier || "") + '">' +
                    '<input type="text" maxlength="60" data-track placeholder="Tracking number" value="' + escapeHTML(s.tracking_no || "") + '">' +
                    '<input type="text" maxlength="300" data-url placeholder="Tracking link (optional, https://)" value="' + escapeHTML(s.tracking_url || "") + '">' +
                    '<button type="button" class="contact-btn" data-book="' + id + '">' + (s.status === "booked" ? "Update courier details" : "Save courier and tracking") + "</button></div>" +
                    (s.status === "booked" ? '<button type="button" class="btn btn-outline" data-step="shipped" data-id="' + id + '">Courier collected it (shipped)</button>' : "");
            } else if (s.status === "shipped") {
                action = '<button type="button" class="contact-btn" data-step="delivered" data-id="' + id + '">Courier delivered it</button>';
            }

            const refund = s.refund_status === "due"
                ? '<p class="msg error">Refund due to the buyer: ' + naira(s.fee) + '</p><button type="button" class="contact-btn" data-refund="' + id + '">I have refunded this</button>'
                : s.refund_status === "done" ? '<p class="meta">Shipping fee refunded.</p>' : "";

            return '<div class="business-card"><h3>' + escapeHTML(s.item) + "</h3>" +
                '<p class="meta"><strong>' + escapeHTML(s.status) + "</strong>" + (s.fee ? " • " + naira(s.fee) : "") + (s.eta ? " • " + escapeHTML(s.eta) : "") + "</p>" +
                '<p class="meta">Collect from: ' + (s.pickup_state ? place(s.pickup_city, s.pickup_state, s.pickup_address, s.pickup_phone) : "not given yet") + "</p>" +
                '<p class="meta">Deliver to: ' + place(s.dest_city, s.dest_state, s.dest_address, s.dest_phone) + (s.dest_note ? " • Note: " + escapeHTML(s.dest_note) : "") + "</p>" +
                '<p class="meta"><a href="trade.html?id=' + escapeHTML(s.trade_id) + '">Open the trade</a> • ' + escapeHTML(new Date(s.created_at).toLocaleDateString()) + "</p>" +
                action + refund + "</div>";
        }).join("") || "<p class='meta'>Nothing here.</p>";
    }

    async function run(button, rpc, args, done) {
        button.disabled = true;
        const { error } = await db.rpc(rpc, args);
        say(error ? error.message : done, !error);
        load();
    }

    list.addEventListener("click", function (event) {
        const b = event.target.closest("button");
        if (!b) return;
        const card = b.closest(".business-card");

        if (b.dataset.quote) {
            const fee = parseInt(card.querySelector("[data-fee]").value, 10);
            run(b, "admin_quote_shipment", { p_id: b.dataset.quote, p_fee: isNaN(fee) ? null : fee, p_eta: card.querySelector("[data-eta]").value }, "Price sent. The buyer was told.");
        } else if (b.dataset.book) {
            run(b, "admin_book_shipment", {
                p_id: b.dataset.book, p_courier: card.querySelector("[data-courier]").value,
                p_tracking: card.querySelector("[data-track]").value, p_url: card.querySelector("[data-url]").value
            }, "Courier saved. The buyer and seller can see it.");
        } else if (b.dataset.step) {
            if (!confirm(b.dataset.step === "shipped" ? "Confirm the courier has collected the parcel?" : "Confirm the parcel reached the buyer? The buyer will be asked to confirm.")) return;
            run(b, "admin_shipment_progress", { p_id: b.dataset.id, p_to: b.dataset.step }, "Saved. The buyer was told.");
        } else if (b.dataset.refund) {
            if (!confirm("Confirm you have sent this shipping fee back to the buyer. The buyer will be told.")) return;
            run(b, "admin_shipment_refund_done", { p_id: b.dataset.refund }, "Marked as refunded. The buyer was told.");
        }
    });

    filter.addEventListener("change", load);
    load();
})();