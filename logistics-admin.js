// LBN Phase 9G: the admin's logistics overview and CSV report (Finance permission). Works with supabase-logistics-admin.sql.
// Uses escapeHTML and db from admin.js.

(function () {
    const box = document.getElementById("logiBox");
    const days = document.getElementById("logiDays");
    if (!box || !days || typeof db === "undefined" || !db) return;

    const msg = document.getElementById("logiMsg");

    function naira(n) { return "₦" + Number(n || 0).toLocaleString(); }

    function row(label, value, warn) {
        return '<div class="fee-row"><span>' + escapeHTML(label) + "</span><strong" + (warn && Number(value) > 0 ? ' style="color:#c0392b;"' : "") + ">" + escapeHTML(String(value)) + "</strong></div>";
    }

    async function load() {
        const { data, error } = await db.rpc("admin_logistics_overview", { p_days: parseInt(days.value, 10) });

        if (error) { box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-logistics-admin.sql in Supabase.</p>"; return; }

        const a = data.attention, l = data.live, m = data.money;

        box.innerHTML =
            "<h3>Needs attention now</h3><div class='fee-box'>" +
            row("Paid jobs with no rider for 30+ minutes", a.no_rider_30min, true) +
            row("Jobs accepted but not collected for 2+ hours", a.not_collected_2h, true) +
            row("Delivery fee refunds due", a.delivery_refunds_due, true) +
            row("Shipping fee refunds due", a.shipment_refunds_due, true) +
            row("Shipments waiting for a price", a.shipments_to_price, true) +
            row("Paid shipments waiting for a courier", a.shipments_to_book, true) +
            row("Open delivery problems", a.open_problems, true) +
            row("Rider emergencies not handled", a.rider_emergencies, true) +
            row("Riders waiting for approval", a.riders_pending, true) +
            row("Owed to riders (not yet paid)", naira(a.owed_to_riders), a.owed_to_riders) + "</div>" +
            "<h3>Right now</h3><div class='fee-box'>" +
            row("Riders online", l.riders_online) + row("Jobs waiting for a rider", l.finding_rider) +
            row("Jobs accepted, not collected", l.assigned) + row("Jobs on the way", l.picked_up) +
            row("Courier booked", l.ship_booked) + row("Courier parcels on the way", l.ship_shipped) + "</div>" +
            "<h3>Money, last " + Number(data.days) + " days</h3><div class='fee-box'>" +
            row("Rider deliveries completed", m.rider_deliveries) + row("Delivery fees paid by buyers", naira(m.rider_fees)) +
            row("Rider share", naira(m.rider_share)) + row("LBN share", naira(m.lbn_share)) +
            row("Courier shipments paid", m.shipments) + row("Shipping fees paid by buyers", naira(m.shipping_fees)) +
            row("Fees refunded or due for refund", naira(m.refunds)) + "</div>";
    }

    function csvCell(v) {
        let s = v === null || v === undefined ? "" : String(v);
        if (/^[=+\-@]/.test(s)) s = "'" + s; // stops spreadsheet formulas
        return '"' + s.replace(/"/g, '""') + '"';
    }

    document.getElementById("logiExport").addEventListener("click", async function () {
        const from = document.getElementById("logiFrom").value;
        const to = document.getElementById("logiTo").value;

        if (!from || !to) { msg.textContent = "Choose the start and end dates."; msg.className = "msg error"; return; }

        const { data, error } = await db.rpc("admin_logistics_report", { p_from: from, p_to: to });

        if (error) { msg.textContent = error.message; msg.className = "msg error"; return; }

        const head = ["Type", "Id", "Trade", "Status", "From", "To", "Fee", "Rider or courier", "Paid", "Delivered", "Refund"];
        const lines = [head.map(csvCell).join(",")].concat((data || []).map(function (r) {
            return [r.kind, r.id, r.trade_id, r.status, r.from_place, r.to_place, r.fee, r.rider_or_courier, r.paid_at, r.delivered_at, r.refund_status].map(csvCell).join(",");
        }));

        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "lbn-logistics-" + from + "-to-" + to + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);

        msg.textContent = (data || []).length + " rows downloaded.";
        msg.className = "msg ok";
    });

    days.addEventListener("change", load);
    load();
    setInterval(function () { if (!document.hidden) load(); }, 30000);
})();