// LBN Phase 6C: the admin's "Seller ID checks" panel (Finance permission).
// Works with supabase-seller-id.sql. Uses escapeHTML from admin.js.

(function () {
    const list = document.getElementById("idList");
    const filter = document.getElementById("idFilter");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    const TYPE_TEXT = {
        nin_slip: "NIN slip",
        voters_card: "Voter's card",
        passport: "International passport",
        drivers_licence: "Driver's licence"
    };

    let rows = [];

    async function signed(path) {
        const result = await db.storage.from("seller-ids").createSignedUrl(path, 600);
        return result.data ? result.data.signedUrl : "";
    }

    async function load() {
        const { data, error } = await db.rpc("admin_seller_verifications", { p_status: filter.value });

        if (error) {
            list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-seller-id.sql in Supabase.</p>";
            return;
        }

        rows = data || [];
        await render();
    }

    async function render() {
        if (rows.length === 0) {
            list.innerHTML = "<p class='meta'>" + (filter.value === "pending" ? "No ID checks are waiting." : "Nothing here.") + "</p>";
            return;
        }

        const cards = await Promise.all(rows.map(async function (r) {
            const pending = r.status === "pending";
            const idUrl = pending ? await signed(r.id_path) : "";
            const selfieUrl = pending ? await signed(r.selfie_path) : "";

            const photos = pending
                ? '<div class="evidence-grid">' +
                    '<div class="evidence-item"><a href="' + escapeHTML(idUrl) + '" target="_blank" rel="noopener"><img src="' + escapeHTML(idUrl) + '" alt="ID photo"></a><p class="meta">ID photo</p></div>' +
                    '<div class="evidence-item"><a href="' + escapeHTML(selfieUrl) + '" target="_blank" rel="noopener"><img src="' + escapeHTML(selfieUrl) + '" alt="Selfie with ID"></a><p class="meta">Selfie with ID</p></div>' +
                  "</div>"
                : "";

            const actions = pending
                ? '<label class="meta"><input type="checkbox" class="id-name-ok"> I checked: the name on the ID matches the bank account name, and the selfie matches the ID photo.</label>' +
                  '<button type="button" class="contact-btn" data-act="approve" data-user="' + escapeHTML(r.user_id) + '">Approve</button> ' +
                  '<input type="text" class="id-reason" maxlength="300" placeholder="If you reject: tell the seller what to fix">' +
                  '<button type="button" class="delete-btn" data-act="reject" data-user="' + escapeHTML(r.user_id) + '">Reject</button>'
                : "";

            return '<div class="business-card" data-user="' + escapeHTML(r.user_id) + '">' +
                "<h3>" + escapeHTML(r.full_name || "Member") + ' <span class="badge ' + (r.status === "approved" ? "lecturer" : r.status === "rejected" ? "closed" : "admin") + '">' + escapeHTML(r.status) + "</span></h3>" +
                "<p><strong>Name on the ID:</strong> " + escapeHTML(r.legal_name) + " (" + escapeHTML(TYPE_TEXT[r.id_type] || r.id_type) + ")</p>" +
                "<p><strong>Bank account:</strong> " +
                    (r.account_number
                        ? escapeHTML(r.bank_name) + " &bull; " + escapeHTML(r.account_number) + " &bull; <strong>" + escapeHTML(r.account_name) + "</strong>"
                        : "none saved") + "</p>" +
                '<p class="meta">Sent ' + new Date(r.submitted_at).toLocaleString() + (r.reject_reason ? " &bull; Rejected: " + escapeHTML(r.reject_reason) : "") + "</p>" +
                photos + actions + "</div>";
        }));

        list.innerHTML = cards.join("");
    }

    list.addEventListener("click", async function (event) {
        const button = event.target.closest("button[data-act]");
        if (!button) return;

        const card = button.closest(".business-card");
        const approve = button.dataset.act === "approve";
        const nameOk = card.querySelector(".id-name-ok").checked;
        const reason = card.querySelector(".id-reason").value.trim();

        if (approve && !nameOk) {
            alert("Tick the box first to confirm you checked the name and the selfie.");
            return;
        }

        if (!approve && reason.length < 10) {
            alert("Write what the seller must fix (at least 10 characters) in the box next to Reject.");
            return;
        }

        if (!confirm(approve ? "Approve this seller? They can then be paid." : "Reject this check?")) return;

        button.disabled = true;

        const { error } = await db.rpc("admin_seller_verification_decide", {
            p_user: button.dataset.user,
            p_approve: approve,
            p_name_checked: nameOk,
            p_reason: approve ? null : reason
        });

        if (error) {
            button.disabled = false;
            alert(error.message);
            return;
        }

        await load();

        // The payment list shows who is cleared, so refresh it too
        if (typeof loadQueue === "function") loadQueue();
    });

    filter.addEventListener("change", load);

    load();
    setInterval(function () {
        if (document.hidden) return;

        // Never refresh while the admin is in the middle of checking someone
        const busy = Array.from(list.querySelectorAll(".id-reason")).some(function (i) { return i.value.trim() !== ""; }) ||
            list.querySelector(".id-name-ok:checked");

        if (!busy) load();
    }, 60000);
})();