// LBN Phase 10A: the admin's "Live streams" panel (Support permission). Works with supabase-streams.sql.
// Uses escapeHTML and db from admin.js.

(function () {
    const list = document.getElementById("streamAdminList");
    const filter = document.getElementById("streamAdminFilter");
    const msg = document.getElementById("streamAdminMsg");
    if (!list || !filter || typeof db === "undefined" || !db) return;

    function say(text, ok) { msg.textContent = text || ""; msg.className = "msg " + (ok ? "ok" : "error"); }

    async function load() {
        const { data, error } = await db.rpc("admin_streams", { p_status: filter.value });

        if (error) { list.innerHTML = "<p class='meta'>Not set up yet. Run supabase-streams.sql in Supabase.</p>"; return; }

        list.innerHTML = (data || []).map(function (s) {
            const id = escapeHTML(s.id);
            return '<div class="business-card"><h3>' + escapeHTML(s.title) + "</h3>" +
                '<p class="meta">By ' + escapeHTML(s.host_name) + " • " + escapeHTML(s.status) + " • " + Number(s.viewers) + " watching now • peak " + Number(s.peak_viewers) +
                (s.reports ? ' • <strong style="color:#c0392b;">' + s.reports + " report(s)</strong>" : "") + (s.banned ? " • banned from streaming" : "") + "</p>" +
                '<p class="meta">' + escapeHTML(new Date(s.started_at).toLocaleString()) + "</p>" +
                (s.status === "live" ? '<a class="btn btn-outline" href="stream.html?s=' + id + '" target="_blank" rel="noopener">Watch</a> ' +
                    '<button type="button" class="delete-btn" data-end="' + id + '">End this stream</button> ' : "") +
                (s.reports ? '<button type="button" class="btn btn-outline" data-reports="' + id + '">Read reports</button> ' : "") +
                (s.banned ? '<button type="button" class="btn btn-outline" data-unban="' + escapeHTML(s.host_id) + '">Allow streaming again</button>'
                          : '<button type="button" class="delete-btn" data-ban="' + escapeHTML(s.host_id) + '">Ban from streaming</button>') +
                '<div data-box></div></div>';
        }).join("") || "<p class='meta'>No streams here.</p>";
    }

    async function run(rpc, args, done) {
        const { error } = await db.rpc(rpc, args);
        say(error ? error.message : done, !error);
        load();
    }

    list.addEventListener("click", async function (event) {
        const b = event.target.closest("button");
        if (!b) return;

        if (b.dataset.end) {
            const reason = prompt("Reason (the streamer will be told):", "Breaking the LBN rules");
            if (reason !== null) run("admin_stream_end", { p_stream: b.dataset.end, p_reason: reason }, "The stream was ended.");
        } else if (b.dataset.ban) {
            const reason = prompt("Reason for the ban (the member will be told, 5 characters or more):");
            if (reason) run("admin_stream_ban", { p_user: b.dataset.ban, p_reason: reason }, "The member can no longer go live.");
        } else if (b.dataset.unban) {
            run("admin_stream_unban", { p_user: b.dataset.unban }, "The member can stream again.");
        } else if (b.dataset.reports) {
            const box = b.closest(".business-card").querySelector("[data-box]");
            const { data, error } = await db.rpc("admin_stream_reports", { p_stream: b.dataset.reports });
            box.innerHTML = error ? "<p class='msg error'>" + escapeHTML(error.message) + "</p>" : (data || []).map(function (r) {
                return '<p class="meta">' + escapeHTML(r.reporter) + ": " + escapeHTML(r.reason) + "</p>";
            }).join("");
        }
    });

    const maxBox = document.getElementById("streamMaxGuests");

    async function loadMax() {
        if (!maxBox) return;
        const { data } = await db.rpc("admin_stream_settings");
        if (data) maxBox.value = data.max_guests;
    }

    const maxSave = document.getElementById("streamMaxSave");
    if (maxSave) {
        maxSave.addEventListener("click", function () {
            run("admin_set_stream_max_guests", { p_max: parseInt(maxBox.value, 10) }, "Saved. This is the most guests a streamer can have on stage.");
        });
    }

    // ----- Gift list -----
    const giftBox = document.getElementById("giftAdminList");

    async function loadGifts() {
        if (!giftBox) return;
        const { data, error } = await db.rpc("admin_live_gifts");

        if (error) { giftBox.innerHTML = "<p class='meta'>Gifts are not set up yet. Run supabase-live-gifts.sql in Supabase.</p>"; return; }

        giftBox.innerHTML = (data || []).map(function (g) {
            return '<div class="business-card" data-gift="' + escapeHTML(g.id) + '"><div class="filters">' +
                '<input type="text" data-emoji maxlength="8" style="max-width:70px;" value="' + escapeHTML(g.emoji) + '">' +
                '<input type="text" data-name maxlength="20" value="' + escapeHTML(g.name) + '">' +
                '<input type="number" data-cost min="1" max="10000" style="max-width:110px;" value="' + Number(g.cost) + '">' +
                '<select data-anim><option value="float"' + (g.animation === "float" ? " selected" : "") + '>Float up</option><option value="burst"' + (g.animation === "burst" ? " selected" : "") + '>Burst</option><option value="big"' + (g.animation === "big" ? " selected" : "") + '>Big screen</option></select>' +
                '<select data-active><option value="1"' + (g.active ? " selected" : "") + '>Shown</option><option value="0"' + (g.active ? "" : " selected") + '>Hidden</option></select>' +
                '<button type="button" class="contact-btn" data-save-gift>Save</button></div>' +
                '<p class="meta">Sent ' + Number(g.times_sent) + " times</p></div>";
        }).join("");
    }

    function giftArgs(root, id) {
        return {
            p_id: id, p_name: root.querySelector("[data-name]").value, p_emoji: root.querySelector("[data-emoji]").value,
            p_cost: parseInt(root.querySelector("[data-cost]").value, 10), p_animation: root.querySelector("[data-anim]").value,
            p_active: root.querySelector("[data-active]").value === "1"
        };
    }

    if (giftBox) {
        giftBox.addEventListener("click", async function (event) {
            const b = event.target.closest("button[data-save-gift]");
            if (!b) return;
            const card = b.closest("[data-gift]");
            const { error } = await db.rpc("admin_save_live_gift", giftArgs(card, card.dataset.gift));
            say(error ? error.message : "Gift saved.", !error);
            loadGifts();
        });

        const add = document.getElementById("giftAdd");
        if (add) {
            add.addEventListener("click", async function () {
                const { error } = await db.rpc("admin_save_live_gift", giftArgs(document.getElementById("giftNew"), null));
                say(error ? error.message : "Gift added.", !error);
                loadGifts();
            });
        }
    }

    // ----- Coins, prices and packs -----
    const coinBox = document.getElementById("coinAdmin");

    async function loadCoins() {
        if (!coinBox) return;
        const st = await db.rpc("admin_coin_settings");
        if (st.error || !st.data) { coinBox.innerHTML = "<p class='meta'>Coins are not set up yet. Run supabase-coins.sql in Supabase.</p>"; return; }
        const d = st.data;
        const packs = (await db.rpc("admin_coin_packs")).data || [];

        coinBox.innerHTML =
            '<div class="business-card" id="coinSet"><div class="filters">' +
            '<label><input type="checkbox" id="cSales"' + (d.sales_on ? " checked" : "") + '> Coin sales are ON (members can buy coins)</label>' +
            '<label>Value of 1 coin (naira) <input type="number" id="cPrice" min="1" max="1000" value="' + Number(d.coin_price_naira) + '"></label>' +
            '<label>LBN keeps (%) <input type="number" id="cPct" min="0" max="90" value="' + Number(d.lbn_percent) + '"></label>' +
            '<label>Hold earnings (days) <input type="number" id="cHold" min="0" max="60" value="' + Number(d.hold_days) + '"></label>' +
            '<button type="button" class="contact-btn" id="cSave">Save</button></div>' +
            '<p class="meta">Coins sold so far: N' + Number(d.sold_naira).toLocaleString("en-NG") + '. Streamers earned (recorded, not paid out): N' + Number(d.earned_naira).toLocaleString("en-NG") + '.</p></div>' +
            '<h4>Coin packs</h4>' +
            packs.map(function (p) {
                return '<div class="business-card" data-pack="' + escapeHTML(p.id) + '"><div class="filters">' +
                    '<label>Coins <input type="number" class="pc" min="1" value="' + Number(p.coins) + '"></label>' +
                    '<label>Price (naira) <input type="number" class="pp" min="100" value="' + Number(p.price_naira) + '"></label>' +
                    '<label><input type="checkbox" class="pa"' + (p.active ? " checked" : "") + '> Shown</label>' +
                    '<button type="button" class="contact-btn" data-save-pack>Save</button></div>' +
                    '<p class="meta">Sold: ' + Number(p.sold) + '</p></div>';
            }).join("") +
            '<div class="business-card" id="packNew"><div class="filters"><label>New pack coins <input type="number" class="pc" min="1"></label>' +
            '<label>Price (naira) <input type="number" class="pp" min="100"></label>' +
            '<button type="button" class="btn btn-outline" id="packAdd">Add pack</button></div></div>' +
            '<p id="coinMsg" class="msg"></p>';

        const say = function (t, ok) { const m = document.getElementById("coinMsg"); m.className = "msg " + (ok ? "ok" : "error"); m.textContent = t; };

        document.getElementById("cSave").addEventListener("click", async function () {
            const on = document.getElementById("cSales").checked;
            if (on && !confirm("Turn coin sales ON? Real money will be taken from members. Only do this after your lawyer agrees.")) return;
            const r = await db.rpc("admin_set_coin_settings", {
                p_sales_on: on, p_price: parseInt(document.getElementById("cPrice").value, 10),
                p_percent: parseInt(document.getElementById("cPct").value, 10), p_hold: parseInt(document.getElementById("cHold").value, 10) });
            if (r.error) say(r.error.message, false); else { say("Saved.", true); }
        });

        coinBox.onclick = async function (e) {
            const b = e.target.closest("button[data-save-pack]");
            if (!b) return;
            const c = b.closest("[data-pack]");
            const r = await db.rpc("admin_save_coin_pack", { p_id: c.dataset.pack, p_coins: parseInt(c.querySelector(".pc").value, 10),
                p_price: parseInt(c.querySelector(".pp").value, 10), p_active: c.querySelector(".pa").checked });
            if (r.error) say(r.error.message, false); else say("Pack saved.", true);
        };

        document.getElementById("packAdd").addEventListener("click", async function () {
            const c = document.getElementById("packNew");
            const r = await db.rpc("admin_save_coin_pack", { p_id: null, p_coins: parseInt(c.querySelector(".pc").value, 10),
                p_price: parseInt(c.querySelector(".pp").value, 10), p_active: true });
            if (r.error) say(r.error.message, false); else { loadCoins(); }
        });
    }

    filter.addEventListener("change", load);
    loadCoins();
    loadGifts();
    loadMax();
    load();
    setInterval(function () { if (!document.hidden && filter.value === "live") load(); }, 20000);
})();