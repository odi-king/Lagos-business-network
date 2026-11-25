// LBN Phase 10E: a streamer's earnings, bank account and withdrawals. Works with supabase-creator-payouts.sql.

(function () {
    function el(id) { return document.getElementById(id); }
    function esc(v) { return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function naira(k) { return "N" + Math.floor(Number(k || 0) / 100).toLocaleString("en-NG"); }
    function say(id, t, ok) { const m = el(id); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }

    let ready = 0;
    let minK = 0;

    async function load() {
        const { data: sess } = await db.auth.getSession();
        if (!sess.session) { location.href = "auth.html?next=earnings.html"; return; }

        const { data, error } = await db.rpc("my_stream_earnings");

        if (error || !data) {
            el("money").innerHTML = "<p class='meta'>Earnings are not set up yet. (The LBN team still needs to run supabase-creator-payouts.sql.)</p>";
            return;
        }

        ready = Number(data.ready_kobo);
        minK = Number(data.min_naira) * 100;

        el("money").innerHTML =
            "<p>Ready to withdraw: <strong>" + naira(data.ready_kobo) + "</strong></p>" +
            "<p class='meta'>Waiting (held " + Number(data.hold_days) + " days after each gift): " + naira(data.waiting_kobo) + "</p>" +
            "<p class='meta'>In a withdrawal being paid: " + naira(data.requested_kobo) + " &bull; Already paid to you: " + naira(data.paid_kobo) + "</p>" +
            "<p class='meta'>Smallest withdrawal: N" + Number(data.min_naira).toLocaleString("en-NG") + "</p>" +
            (data.frozen ? "<p class='msg error'>Your earnings are on hold. Please contact LBN support.</p>" : "");

        el("withdrawBtn").style.display = data.frozen ? "none" : "";

        if (data.account) {
            el("bBank").value = data.account.bank;
            el("bNum").value = data.account.number;
            el("bName").value = data.account.name;
        }

        const h = data.payouts || [];
        el("history").innerHTML = h.length ? h.map(function (p) {
            const label = p.status === "paid" ? "Paid" : p.status === "rejected" ? "Not approved" : "Waiting for the LBN team";
            return "<div class='business-card'><strong>" + naira(p.amount_kobo) + "</strong> - " + label +
                "<p class='meta'>" + esc(new Date(p.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })) + (p.note ? " - " + esc(p.note) : "") + "</p></div>";
        }).join("") : "<p class='meta'>No withdrawals yet.</p>";
    }

    el("bankForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const { error } = await db.rpc("save_payout_account", { p_bank: el("bBank").value, p_number: el("bNum").value, p_name: el("bName").value });
        say("bMsg", error ? error.message : "Bank account saved.", !error);
    });

    el("withdrawBtn").addEventListener("click", async function () {
        if (ready < minK) { say("wMsg", "You need at least N" + (minK / 100).toLocaleString("en-NG") + " ready to withdraw.", false); return; }
        if (!confirm("Withdraw " + naira(ready) + " to your saved bank account?")) return;
        this.disabled = true;
        const { data, error } = await db.rpc("request_creator_payout");
        this.disabled = false;
        if (error || !data || data.ok === false) { say("wMsg", error ? error.message : (data && data.message) || "Could not ask", false); return; }
        say("wMsg", "Done. The LBN team will pay " + naira(data.amount_kobo) + " into your bank account.", true);
        load();
    });

    load();
})();