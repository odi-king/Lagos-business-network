// LBN Phase 9A: the admin's delivery panel (areas, prices between areas, LBN share, deliveries and refunds).
// Works with supabase-delivery.sql. Uses escapeHTML and db from admin.js.

(function () {
    const box = document.getElementById("delZones");
    if (!box || typeof db === "undefined" || !db) return;

    const msg = document.getElementById("delMsg");
    const feeA = document.getElementById("delFeeA");
    const feeB = document.getElementById("delFeeB");
    const feeAmount = document.getElementById("delFeeAmount");
    const feeList = document.getElementById("delFees");
    const list = document.getElementById("delList");
    const filter = document.getElementById("delFilter");
    const percent = document.getElementById("delPercent");

    let zones = [];

    function say(text, ok) {
        msg.className = "msg " + (ok ? "ok" : "error");
        msg.textContent = text || "";
    }

    function naira(n) { return "₦" + Number(n || 0).toLocaleString(); }

    async function loadZones() {
        const { data, error } = await db.rpc("admin_delivery_zones");

        if (error) {
            box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-delivery.sql in Supabase.</p>";
            return false;
        }

        zones = data || [];

        box.innerHTML = zones.map(function (z) {
            return '<div class="comment"><strong>' + escapeHTML(z.name) + "</strong>" +
                (z.active ? "" : ' <span class="meta">(hidden)</span>') +
                ' <span class="meta">' + z.routes + (z.routes === 1 ? " price" : " prices") + "</span> " +
                '<button type="button" class="btn btn-outline" data-zone="toggle" data-id="' + escapeHTML(z.id) + '">' + (z.active ? "Hide" : "Show") + "</button> " +
                '<button type="button" class="btn btn-outline" data-zone="rename" data-id="' + escapeHTML(z.id) + '">Rename</button></div>';
        }).join("") || "<p class='meta'>No areas yet.</p>";

        const options = zones.filter(function (z) { return z.active; }).map(function (z) {
            return '<option value="' + escapeHTML(z.id) + '">' + escapeHTML(z.name) + "</option>";
        }).join("");

        feeA.innerHTML = '<option value="" disabled selected>From area</option>' + options;
        feeB.innerHTML = '<option value="" disabled selected>To area</option>' + options;
        return true;
    }

    async function loadFees() {
        const { data, error } = await db.rpc("admin_delivery_fees");
        if (error) return;

        feeList.innerHTML = (data || []).map(function (f) {
            return '<div class="comment">' + escapeHTML(f.name_a) + " ↔ " + escapeHTML(f.name_b) + ": <strong>" + naira(f.fee) + "</strong> " +
                '<button type="button" class="btn btn-outline" data-fee="edit" data-a="' + escapeHTML(f.zone_a) + '" data-b="' + escapeHTML(f.zone_b) + '" data-v="' + f.fee + '">Change</button> ' +
                '<button type="button" class="delete-btn" data-fee="remove" data-a="' + escapeHTML(f.zone_a) + '" data-b="' + escapeHTML(f.zone_b) + '">Remove</button></div>';
        }).join("") || "<p class='meta'>No prices yet. Buyers cannot choose delivery until you set at least one price.</p>";
    }

    async function loadPercent() {
        const { data, error } = await db.rpc("admin_delivery_percent");
        if (!error && data !== null) percent.value = data;
    }

    async function loadDeliveries() {
        const { data, error } = await db.rpc("admin_deliveries", { p_status: filter.value });

        if (error) { list.innerHTML = ""; return; }

        list.innerHTML = (data || []).map(function (d) {
            const refund = d.refund_status === "due"
                ? '<p class="msg error">Refund due to the buyer: ' + naira(d.fee) + '</p><button type="button" class="contact-btn" data-refund="' + escapeHTML(d.id) + '">I have refunded this</button>'
                : d.refund_status === "done" ? '<p class="meta">Delivery fee refunded.</p>' : "";

            return '<div class="business-card"><h3>' + escapeHTML(d.item) + "</h3>" +
                '<p class="meta">' + escapeHTML(d.pickup_zone || "?") + " → " + escapeHTML(d.drop_zone || "?") +
                " • " + naira(d.fee) + " (rider share " + naira(d.rider_amount) + ") • " + escapeHTML(d.status.replace(/_/g, " ")) + "</p>" +
                '<p class="meta"><a href="trade.html?id=' + escapeHTML(d.trade_id) + '">Open the trade</a> • ' + escapeHTML(new Date(d.created_at).toLocaleDateString()) + "</p>" + refund + "</div>";
        }).join("") || "<p class='meta'>No deliveries here.</p>";
    }

    async function loadAll() {
        if (await loadZones()) {
            loadFees();
            loadPercent();
            loadDeliveries();
        }
    }

    box.addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-zone]");
        if (!b) return;

        const zone = zones.find(function (z) { return z.id === b.dataset.id; });
        if (!zone) return;

        let name = zone.name;
        let active = zone.active;

        if (b.dataset.zone === "rename") {
            const typed = prompt("New name for this area:", zone.name);
            if (!typed) return;
            name = typed;
        } else {
            active = !zone.active;
        }

        const { error } = await db.rpc("admin_save_zone", { p_id: zone.id, p_name: name, p_active: active });
        say(error ? error.message : "Saved.", !error);
        loadAll();
    });

    document.getElementById("delAddZone").addEventListener("click", async function () {
        const input = document.getElementById("delNewZone");
        if (!input.value.trim()) { say("Type the name of the area first.", false); return; }

        const { error } = await db.rpc("admin_save_zone", { p_id: null, p_name: input.value, p_active: true });
        say(error ? error.message : "Area added.", !error);
        if (!error) input.value = "";
        loadAll();
    });

    document.getElementById("delSaveFee").addEventListener("click", async function () {
        if (!feeA.value || !feeB.value) { say("Choose both areas.", false); return; }

        const { error } = await db.rpc("admin_set_delivery_fee", {
            p_a: feeA.value, p_b: feeB.value, p_fee: parseInt(feeAmount.value, 10)
        });

        say(error ? error.message : "Price saved. It works in both directions.", !error);
        if (!error) feeAmount.value = "";
        loadFees();
        loadZones();
    });

    feeList.addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-fee]");
        if (!b) return;

        let value = 0;

        if (b.dataset.fee === "edit") {
            const typed = prompt("New price in naira:", b.dataset.v);
            if (!typed) return;
            value = parseInt(typed, 10);
        } else if (!confirm("Remove this price? Delivery between these two areas will stop being offered.")) {
            return;
        }

        const { error } = await db.rpc("admin_set_delivery_fee", { p_a: b.dataset.a, p_b: b.dataset.b, p_fee: value });
        say(error ? error.message : "Saved.", !error);
        loadFees();
        loadZones();
    });

    document.getElementById("delSavePercent").addEventListener("click", async function () {
        const { error } = await db.rpc("admin_set_delivery_percent", { p_percent: parseInt(percent.value, 10) });
        say(error ? error.message : "Saved. It applies to deliveries paid from now on.", !error);
    });

    filter.addEventListener("change", loadDeliveries);

    list.addEventListener("click", async function (event) {
        const b = event.target.closest("button[data-refund]");
        if (!b) return;

        if (!confirm("Confirm you have sent this delivery fee back to the buyer. The buyer will be told.")) return;

        b.disabled = true;
        const { error } = await db.rpc("admin_delivery_refund_done", { p_id: b.dataset.refund });
        say(error ? error.message : "Marked as refunded. The buyer was told.", !error);
        loadDeliveries();
    });

    loadAll();
})();