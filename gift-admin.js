// LBN Phase 7G: the admin's graduation gift packages panel. Works with supabase-gifts.sql. Uses escapeHTML and db from admin.js.

(function () {
    const list = document.getElementById("giftList");
    const filter = document.getElementById("giftFilter");
    const message = document.getElementById("giftMsg");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    let rows = [];

    function say(text, ok) {
        message.className = "msg " + (ok ? "ok" : "error");
        message.textContent = text;
    }

    async function load() {
        const { data, error } = await db.rpc("admin_gift_packages", { p_status: filter.value });

        if (error) {
            list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-gifts.sql in Supabase.</p>";
            return;
        }

        rows = data || [];
        render();
    }

    function render() {
        if (rows.length === 0) {
            list.innerHTML = "<p class='meta'>No packages here.</p>";
            return;
        }

        list.innerHTML = rows.map(function (p) {
            const actions = p.status === "preparing"
                ? '<input type="text" class="gift-courier" maxlength="60" placeholder="Courier company (for example GIG Logistics)">' +
                  '<input type="text" class="gift-tracking" maxlength="60" placeholder="Tracking number">' +
                  '<button type="button" class="contact-btn" data-gift="shipped" data-id="' + escapeHTML(p.id) + '">Mark as shipped</button>'
                : p.status === "shipped"
                    ? '<p class="meta">Courier: ' + escapeHTML(p.courier) + " &bull; Tracking: " + escapeHTML(p.tracking_no) + "</p>" +
                      '<button type="button" class="contact-btn" data-gift="delivered" data-id="' + escapeHTML(p.id) + '">Mark as delivered</button>'
                    : '<p class="meta">Courier: ' + escapeHTML(p.courier) + " &bull; Tracking: " + escapeHTML(p.tracking_no) + "</p>";

            return '<div class="business-card" data-id="' + escapeHTML(p.id) + '">' +
                "<h3>" + escapeHTML(p.recipient_name) + ' <span class="badge ' + (p.status === "delivered" ? "lecturer" : "admin") + '">' + escapeHTML(p.status) + "</span></h3>" +
                "<p><strong>Phone:</strong> " + escapeHTML(p.phone) + "<br><strong>Address:</strong> " + escapeHTML(p.address) + ", " + escapeHTML(p.city) + ", " +
                escapeHTML(p.state) + ", " + escapeHTML(p.country) + "<br><strong>Shirt size:</strong> " + escapeHTML(p.shirt_size) + "</p>" +
                actions + "</div>";
        }).join("");
    }

    // A spreadsheet can run a cell that starts with = + - or @ as a formula, so those get a quote in front
    function csvCell(value) {
        let text = String(value == null ? "" : value);
        if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
    }

    document.getElementById("giftExport").addEventListener("click", function () {
        if (rows.length === 0) {
            say("There is nothing to download in this list.", false);
            return;
        }

        const head = ["Name", "Phone", "Address", "City", "State", "Country", "Shirt size", "Status", "Courier", "Tracking number", "Created"];
        const lines = [head.map(csvCell).join(",")].concat(rows.map(function (p) {
            return [p.recipient_name, p.phone, p.address, p.city, p.state, p.country, p.shirt_size, p.status, p.courier, p.tracking_no,
                new Date(p.created_at).toLocaleDateString()].map(csvCell).join(",");
        }));

        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "lbn-gift-packages-" + filter.value + "-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

        say("List downloaded. It holds personal details: keep it safe and delete it when the packages are sent.", true);
    });

    list.addEventListener("click", async function (event) {
        const button = event.target.closest("button[data-gift]");
        if (!button) return;

        const card = button.closest(".business-card");
        const next = button.dataset.gift;

        const courierBox = card.querySelector(".gift-courier");
        const trackingBox = card.querySelector(".gift-tracking");

        if (next === "shipped" && (!courierBox.value.trim() || !trackingBox.value.trim())) {
            say("Write the courier company and the tracking number first.", false);
            return;
        }

        if (!confirm(next === "shipped" ? "Mark this package as shipped? The graduate will be told." : "Mark this package as delivered?")) return;

        button.disabled = true;

        const { error } = await db.rpc("admin_gift_update", {
            p_id: button.dataset.id,
            p_status: next,
            p_courier: courierBox ? courierBox.value : null,
            p_tracking: trackingBox ? trackingBox.value : null,
            p_note: null
        });

        if (error) {
            button.disabled = false;
            say(error.message, false);
            return;
        }

        say(next === "shipped" ? "Marked as shipped. The graduate was told." : "Marked as delivered.", true);
        await load();
    });

    filter.addEventListener("change", load);
    load();
})();