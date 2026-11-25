// LBN Phase 9F: "Report a delivery problem" on a purchase. Works with supabase-delivery-issues.sql.
// Uses these from trade.js: db, trade, me, tradeId.

(function () {
    const box = document.getElementById("issueBox");
    if (!box || typeof db === "undefined" || !db) return;

    let data = null;
    let lastSig = "";
    let open = false;
    let busy = false;

    function esc(value) {
        return String(value === null || value === undefined ? "" : value).replace(/[&<>"']/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    }

    const KINDS = {
        buyer: [["not_arrived", "The item has not arrived"], ["damaged", "The item arrived damaged"], ["wrong_item", "It is not what I ordered"],
                ["return_request", "I want to return the item"], ["rider_problem", "Problem with the rider"], ["courier_problem", "Problem with the courier"], ["other", "Something else"]],
        seller: [["rider_problem", "Problem with the rider"], ["courier_problem", "Problem with the courier"], ["return_request", "The buyer wants to return it"], ["other", "Something else"]]
    };

    function render() {
        if (!data || !data.eligible) { box.style.display = "none"; return; }

        let html = "<h4>Delivery problems</h4>";
        const issues = data.issues || [];

        issues.forEach(function (i) {
            html += "<p class='meta'><strong>" + esc(i.role) + ":</strong> " + esc(i.kind) + " — " + esc(i.body) +
                (i.status === "resolved" ? " <em>(closed: " + esc(i.admin_note) + ")</em>" : " <em>(the LBN team is looking into it)</em>") + "</p>";
        });

        if (open) {
            html += '<form class="issue-form"><select name="kind">' +
                (KINDS[data.role] || KINDS.seller).map(function (k) { return '<option value="' + k[0] + '">' + esc(k[1]) + "</option>"; }).join("") +
                '</select><input type="text" name="body" maxlength="500" placeholder="Tell us what happened" required>' +
                '<button type="submit" class="contact-btn">Send report</button> <button type="button" class="plain-btn" data-issue="close">Cancel</button>' +
                '<p class="msg issue-msg"></p></form>';
        } else {
            html += '<button type="button" class="btn btn-outline" data-issue="open">Report a delivery problem</button><p class="msg issue-msg"></p>';
        }

        box.innerHTML = html;
        box.style.display = "block";
    }

    async function refresh(force) {
        if (busy || typeof trade === "undefined" || !trade || typeof me === "undefined" || !me) return;
        busy = true;

        try {
            const result = await db.rpc("my_delivery_issues", { p_trade: tradeId });

            if (result.error) { data = null; box.style.display = "none"; return; }

            data = result.data;
            const sig = JSON.stringify([data, open]);

            if (force || sig !== lastSig) { lastSig = sig; render(); }
        } finally {
            busy = false;
        }
    }

    box.addEventListener("click", function (event) {
        const b = event.target.closest("[data-issue]");
        if (!b) return;
        open = b.dataset.issue === "open";
        lastSig = "";
        render();
    });

    box.addEventListener("submit", async function (event) {
        if (!event.target.classList.contains("issue-form")) return;
        event.preventDefault();

        const f = event.target;
        const submit = f.querySelector("button[type=submit]");
        submit.disabled = true;

        const res = await db.rpc("report_delivery_issue", { p_trade: tradeId, p_kind: f.kind.value, p_body: f.body.value });
        submit.disabled = false;

        if (res.error || !res.data || res.data.ok === false) {
            const m = f.querySelector(".issue-msg");
            m.className = "msg issue-msg error";
            m.textContent = res.error ? res.error.message : (res.data && res.data.message) || "Could not send";
            return;
        }

        open = false;
        lastSig = "";
        refresh(true);
    });

    refresh(true);
    setInterval(function () { if (!document.hidden) refresh(false); }, 5000);
    setTimeout(function () { refresh(true); }, 1500);
})();