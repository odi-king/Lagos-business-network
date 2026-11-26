// LBN Phase 11B/12A: plans, prices, subscribers and payment records for the admin. Works with supabase-plans.sql.

(function () {
    const box = document.getElementById("billingBox");
    if (!box) return;

    function money(cur, minor) { return (cur === "USD" ? "$" : "₦") + (Number(minor) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
    function day(t) { return new Date(t).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }

    async function load() {
        const r = await db.rpc("admin_billing");
        if (r.error || !r.data) { box.innerHTML = "<p class='meta'>Not set up yet. Run supabase-plans.sql in Supabase.</p>"; return; }
        const d = r.data;
        const list = (await db.rpc("admin_membership_payments", { p_limit: 30 })).data || [];

        box.innerHTML =
            '<p><strong>Members with access now:</strong> ' + d.subscribers.active + ' (paying: ' + d.subscribers.paid_active + ', cancelling: ' + d.subscribers.cancelling + ')</p>' +
            '<h3>Money received</h3>' +
            (d.revenue.length ? d.revenue.map(function (x) { return '<p class="meta">' + escapeHTML(x.provider) + ' - ' + escapeHTML(x.currency) + ': <strong>' + money(x.currency, x.total_minor) + '</strong> from ' + x.payments + ' payments</p>'; }).join("") : "<p class='meta'>No payments yet.</p>") +
            '<h3>International payments (outside Nigeria)</h3>' +
            '<p class="meta">Keep this OFF until the provider is connected and tested. Nigerians always pay through Paystack.</p>' +
            '<div class="filters"><select id="bProv"><option value="">OFF (not open yet)</option><option value="paystack">Paystack (dollars)</option><option value="flutterwave">Flutterwave (not connected yet)</option></select>' +
            '<button type="button" class="contact-btn" id="bProvSave">Save</button></div>' +
            '<h3>Plans and prices</h3>' +
            d.plans.map(function (p) {
                return '<div class="business-card" data-plan="' + escapeHTML(p.code) + '"><div class="filters"><strong>' + (p.region === "NG" ? "Nigeria" : "International") + ' - ' + escapeHTML(p.period) + '</strong>' +
                    '<label>Price (' + escapeHTML(p.currency) + ') <input type="number" class="bp" min="1" step="0.01" value="' + (Number(p.amount_minor) / 100) + '"></label>' +
                    '<label><input type="checkbox" class="ba"' + (p.active ? " checked" : "") + '> Shown</label>' +
                    '<button type="button" class="contact-btn" data-save-plan>Save</button></div></div>';
            }).join("") +
            '<p id="bMsg" class="msg"></p>' +
            '<h3>Latest payments</h3>' +
            (list.length ? list.map(function (p) {
                return '<div class="business-card"><strong>' + money(p.currency, p.amount_minor) + '</strong> - ' + escapeHTML(p.user_name) + ' (' + escapeHTML(p.country_code || "?") + ') - ' + escapeHTML(p.plan_code) + ' via ' + escapeHTML(p.provider) +
                    '<p class="meta">' + day(p.created_at) + ' - access to ' + day(p.period_end) + ' - ' + escapeHTML(p.reference) + '</p></div>';
            }).join("") : "<p class='meta'>No payments yet.</p>");

        document.getElementById("bProv").value = d.intl_provider || "";
        const say = function (t, ok) { const m = document.getElementById("bMsg"); m.className = "msg " + (ok ? "ok" : "error"); m.textContent = t; };

        document.getElementById("bProvSave").addEventListener("click", async function () {
            const v = document.getElementById("bProv").value || null;
            if (v && !confirm("Open international payments through " + v + "? Only do this after it is connected and tested.")) return;
            const x = await db.rpc("admin_set_intl_provider", { p_provider: v });
            say(x.error ? x.error.message : "Saved.", !x.error);
        });

        box.onclick = async function (e) {
            const b = e.target.closest("button[data-save-plan]");
            if (!b) return;
            const c = b.closest("[data-plan]");
            const x = await db.rpc("admin_set_plan", { p_code: c.dataset.plan, p_amount_minor: Math.round(parseFloat(c.querySelector(".bp").value) * 100), p_active: c.querySelector(".ba").checked });
            say(x.error ? x.error.message : "Plan saved.", !x.error);
        };
    }

    load();
})();