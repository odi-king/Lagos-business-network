// LBN Phase 9B: the admin's "Riders" panel (Finance permission). Works with supabase-riders.sql. Uses escapeHTML and db from admin.js.

(function () {
    const list = document.getElementById("riderList");
    const filter = document.getElementById("riderFilter");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    const TYPE_TEXT = { nin_slip: "NIN slip", voters_card: "Voter's card", passport: "International passport", drivers_licence: "Driver's licence" };
    const VEHICLE_TEXT = { motorcycle: "Motorcycle", bicycle: "Bicycle", car: "Car", van: "Van" };

    let rows = [];

    async function signed(path) {
        const result = await db.storage.from("rider-docs").createSignedUrl(path, 600);
        return result.data ? result.data.signedUrl : "";
    }

    function photo(url, label) {
        return '<div class="evidence-item"><a href="' + escapeHTML(url) + '" target="_blank" rel="noopener"><img src="' + escapeHTML(url) + '" alt="' + escapeHTML(label) + '"></a><p class="meta">' + escapeHTML(label) + "</p></div>";
    }

    async function load() {
        const { data, error } = await db.rpc("admin_riders", { p_status: filter.value });

        if (error) {
            list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-riders.sql in Supabase.</p>";
            return;
        }

        rows = data || [];
        await render();
    }

    async function render() {
        if (!rows.length) {
            list.innerHTML = "<p class='meta'>" + (filter.value === "pending" ? "No rider applications are waiting." : "Nothing here.") + "</p>";
            return;
        }

        const cards = await Promise.all(rows.map(async function (r) {
            const pending = r.status === "pending";
            let photos = "";

            if (pending) {
                const urls = await Promise.all([signed(r.id_path), signed(r.selfie_path), signed(r.vehicle_path)]);
                photos = '<div class="evidence-grid">' + photo(urls[0], "ID photo") + photo(urls[1], "Selfie with ID") + photo(urls[2], "Vehicle") + "</div>";
            }

            let actions = "";

            if (pending) {
                actions = '<label class="meta"><input type="checkbox" class="rd-ok"> I checked: the name on the ID matches the bank account name, the selfie matches the ID photo, and the plate in the vehicle photo matches the plate above.</label>' +
                    '<button type="button" class="contact-btn" data-act="approve" data-user="' + escapeHTML(r.user_id) + '">Approve</button> ' +
                    '<input type="text" class="rd-reason" maxlength="300" placeholder="If you reject: tell the rider what to fix">' +
                    '<button type="button" class="delete-btn" data-act="reject" data-user="' + escapeHTML(r.user_id) + '">Reject</button>';
            } else if (r.status === "approved") {
                actions = '<input type="text" class="rd-reason" maxlength="300" placeholder="Reason for suspending this rider">' +
                    '<button type="button" class="delete-btn" data-act="suspend" data-user="' + escapeHTML(r.user_id) + '">Suspend</button>';
            } else if (r.status === "suspended") {
                actions = '<button type="button" class="contact-btn" data-act="reinstate" data-user="' + escapeHTML(r.user_id) + '">Bring back</button>';
            }

            return '<div class="business-card" data-user="' + escapeHTML(r.user_id) + '">' +
                "<h3>" + escapeHTML(r.full_name || "Member") + ' <span class="badge ' + (r.status === "approved" ? "lecturer" : r.status === "pending" ? "admin" : "closed") + '">' + escapeHTML(r.status) + "</span>" + (r.available ? ' <span class="badge lecturer">online</span>' : "") + "</h3>" +
                "<p><strong>Name on the ID:</strong> " + escapeHTML(r.legal_name) + " (" + escapeHTML(TYPE_TEXT[r.id_type] || r.id_type) + ")</p>" +
                "<p><strong>Phone:</strong> " + escapeHTML(r.phone) + " &bull; <strong>Vehicle:</strong> " + escapeHTML(VEHICLE_TEXT[r.vehicle] || r.vehicle) + (r.plate_number ? " &bull; <strong>Plate:</strong> " + escapeHTML(r.plate_number) : "") + "</p>" +
                "<p><strong>Areas:</strong> " + escapeHTML((r.zone_names || []).join(", ")) + "</p>" +
                "<p><strong>Guarantor:</strong> " + escapeHTML(r.guarantor_name) + " &bull; " + escapeHTML(r.guarantor_phone) + "</p>" +
                "<p><strong>Bank account:</strong> " +
                    (r.account_number ? escapeHTML(r.bank_name) + " &bull; " + escapeHTML(r.account_number) + " &bull; <strong>" + escapeHTML(r.account_name) + "</strong>" : "none saved") + "</p>" +
                '<p class="meta">Sent ' + new Date(r.submitted_at).toLocaleString() + (r.reject_reason ? " &bull; Note: " + escapeHTML(r.reject_reason) : "") + "</p>" +
                photos + actions + "</div>";
        }));

        list.innerHTML = cards.join("");
    }

    list.addEventListener("click", async function (event) {
        const button = event.target.closest("button[data-act]");
        if (!button) return;

        const card = button.closest(".business-card");
        const act = button.dataset.act;
        const okBox = card.querySelector(".rd-ok");
        const reasonBox = card.querySelector(".rd-reason");
        const reason = reasonBox ? reasonBox.value.trim() : "";

        if (act === "approve" && !(okBox && okBox.checked)) {
            alert("Tick the box first to confirm you checked the name, the selfie and the plate.");
            return;
        }

        if ((act === "reject" || act === "suspend") && reason.length < 10) {
            alert("Write the reason (at least 10 characters) in the box next to the button.");
            return;
        }

        const question = {
            approve: "Approve this rider? They can then go online and take delivery jobs.",
            reject: "Reject this application? The rider will see your reason.",
            suspend: "Suspend this rider? They go offline and cannot take jobs.",
            reinstate: "Bring this rider back?"
        }[act];

        if (!confirm(question)) return;

        button.disabled = true;

        const { error } = await db.rpc("admin_rider_decide", {
            p_user: button.dataset.user,
            p_action: act,
            p_name_checked: okBox ? okBox.checked : false,
            p_reason: reason || null
        });

        if (error) {
            button.disabled = false;
            alert(error.message);
            return;
        }

        await load();
    });

    filter.addEventListener("change", load);

    load();
    setInterval(function () {
        if (document.hidden) return;

        // Never refresh while the admin is in the middle of checking someone
        const busy = Array.from(list.querySelectorAll(".rd-reason")).some(function (i) { return i.value.trim() !== ""; }) ||
            list.querySelector(".rd-ok:checked");

        if (!busy) load();
    }, 60000);
})();