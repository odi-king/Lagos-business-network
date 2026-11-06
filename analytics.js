let days = 30;
let data = null;
let metric = "visits";

const STATUS_TEXT = {
    completed: "Completed",
    settled: "Settled",
    paid: "Paid, held by LBN",
    delivered: "Delivered",
    agreed: "Deal agreed",
    disputed: "In dispute",
    refunded: "Refunded"
};

function esc(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function money(value) {
    return "\u20A6" + Number(value || 0).toLocaleString();
}

function num(value) {
    return Number(value || 0).toLocaleString();
}

// "+25%" or "-10%" compared with the period before
function delta(now, before) {
    now = Number(now || 0);
    before = Number(before || 0);

    if (before === 0) return now > 0 ? { text: "New", cls: "up" } : { text: "", cls: "" };

    const pct = Math.round(((now - before) / before) * 100);
    return { text: (pct > 0 ? "+" : "") + pct + "%", cls: pct > 0 ? "up" : pct < 0 ? "down" : "" };
}

function kpi(label, value, sub, change) {
    return '<div class="kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' + value + "</div>" +
        (change && change.text ? '<span class="kpi-delta ' + change.cls + '">' + change.text + " vs before</span>" : "") +
        (sub ? '<div class="kpi-sub">' + sub + "</div>" : "") + "</div>";
}

function sum(series) {
    return (series || []).reduce(function (total, p) { return total + Number(p.n || 0); }, 0);
}

// A simple bar chart drawn as an image, so it works on every phone with no extra files
function chart(series, isMoney) {
    if (!series || series.length === 0) return "<p class='meta'>No data yet.</p>";

    const w = 320, h = 140, padX = 8, padTop = 16, padBottom = 22;
    const max = Math.max(1, Math.max.apply(null, series.map(function (p) { return Number(p.n); })));
    const slot = (w - padX * 2) / series.length;
    const barArea = h - padTop - padBottom;

    const bars = series.map(function (p, i) {
        const bh = Math.round((Number(p.n) / max) * barArea);
        const x = padX + i * slot + slot * 0.15;
        const y = h - padBottom - bh;

        return '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y + '" width="' + (slot * 0.7).toFixed(1) + '" height="' + Math.max(bh, 1) +
            '" rx="2"><title>' + p.d + ": " + (isMoney ? money(p.n) : num(p.n)) + "</title></rect>";
    }).join("");

    return '<svg viewBox="0 0 ' + w + " " + h + '" class="bar-chart" role="img" aria-label="Chart">' +
        '<text x="' + padX + '" y="11" class="axis">' + (isMoney ? money(max) : num(max)) + "</text>" + bars +
        '<line x1="' + padX + '" x2="' + (w - padX) + '" y1="' + (h - padBottom) + '" y2="' + (h - padBottom) + '" class="axis-line"/>' +
        '<text x="' + padX + '" y="' + (h - 6) + '" class="axis">' + series[0].d.slice(5) + "</text>" +
        '<text x="' + (w - padX) + '" y="' + (h - 6) + '" text-anchor="end" class="axis">' + series[series.length - 1].d.slice(5) + "</text></svg>";
}

function seriesFor(key) {
    if (key === "visits") return { s: data.visits.series, money: false, label: "profile visits" };
    if (key === "views") return { s: data.posts.series, money: false, label: "item views" };
    if (key === "enquiries") return { s: data.enquiries.series, money: false, label: "enquiries" };
    if (key === "revenue") return { s: data.sales.series, money: true, label: "revenue you received" };
    if (key === "followers") return { s: data.followers.series, money: false, label: "new followers" };
    return { s: data.engagement.series, money: false, label: "likes, comments and reposts" };
}

function drawChart() {
    const pick = seriesFor(metric);
    const total = sum(pick.s);

    document.getElementById("chartTotal").textContent =
        "Total in the last " + days + " days: " + (pick.money ? money(total) : num(total)) + " " + (pick.money ? "" : pick.label);
    document.getElementById("chartBox").innerHTML = chart(pick.s, pick.money);
}

function render() {
    const v = data.visits, p = data.posts, f = data.followers, e = data.engagement,
          q = data.enquiries, s = data.sales, m = data.pending, h = data.handouts;

    const engagementNow = Number(e.likes) + Number(e.comments) + Number(e.reposts);
    const enquiriesNow = Number(q.chats_period) + Number(q.messages_period);

    document.getElementById("kpis").innerHTML =
        kpi("Profile visits", num(v.period), num(v.unique) + " different people", delta(v.period, v.previous)) +
        kpi("Product and service views", num(p.period), "Products " + num(p.products) + " &bull; Services " + num(p.services), delta(p.period, p.previous)) +
        kpi("Enquiries", num(enquiriesNow), num(q.chats_period) + " trade chats &bull; " + num(q.messages_period) + " messages", delta(q.chats_period, q.chats_previous)) +
        kpi("Completed sales", num(s.completed_period), num(s.completed_total) + " all time") +
        kpi("Revenue you received", money(s.net_period), "Sales " + money(s.gross_period) + " &bull; LBN fee " + money(s.fee_period), delta(s.net_period, s.net_previous)) +
        kpi("Followers", num(f.total), "+" + num(f.new_period) + " in this period", delta(f.new_period, f.previous));

    drawChart();

    // From views to sales
    const views = Number(p.period), chats = Number(q.chats_period), sold = Number(s.completed_period);
    const rate = function (a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 + "%" : "-"; };

    document.getElementById("funnel").innerHTML =
        '<div class="funnel-row"><span>People who viewed your items</span><strong>' + num(views) + "</strong></div>" +
        '<div class="funnel-row"><span>Started a trade chat</span><strong>' + num(chats) + ' <span class="meta">(' + rate(chats, views) + ' of views)</span></strong></div>' +
        '<div class="funnel-row"><span>Completed a purchase</span><strong>' + num(sold) + ' <span class="meta">(' + rate(sold, chats) + ' of chats)</span></strong></div>';

    // Money
    const handoutDue = Number(h.payout_due);
    const payoutDue = Number(m.payout_due) + handoutDue;
    const paidOut = Number(m.paid_out) + Number(h.paid_out);

    document.getElementById("money").innerHTML =
        '<div class="kpi-grid">' +
        kpi("Waiting for the buyer to pay", money(m.awaiting_amount), num(m.awaiting_count) + " trade(s) agreed") +
        kpi("Held by LBN until you both confirm", money(m.held_amount), num(m.held_count) + " paid trade(s)") +
        kpi("Payout due to you", money(payoutDue), "LBN is sending this to your bank") +
        kpi("Already paid out to you", money(paidOut), "All time") + "</div>" +
        (payoutDue > 0 && !m.has_payout_account
            ? '<p class="notice">Add your bank details so LBN can pay you. <a href="dashboard.html" style="color: var(--accent);">Add payout account</a></p>' : "") +
        '<p class="meta">' + num(m.in_progress) + " trade(s) are in progress. " + num(s.in_dispute) + " in dispute.</p>";

    // Engagement
    document.getElementById("engagement").innerHTML =
        kpi("Likes", num(e.likes), "On your posts") +
        kpi("Comments", num(e.comments), "From other people") +
        kpi("Reposts", num(e.reposts), "Shared to profiles") +
        kpi("Engagement rate", p.period > 0 ? (Math.round((engagementNow / p.period) * 1000) / 10) + "%" : "-", "Likes, comments and reposts per view", delta(engagementNow, e.previous));

    // Best performers
    const top = data.top_items;
    document.getElementById("topItems").innerHTML = top.length === 0
        ? '<p class="meta">Post a product or service in the marketplace and its results will show here. <a href="feed.html" style="color: var(--accent);">Go to the marketplace</a></p>'
        : top.map(function (t, i) {
            return '<div class="rank-row"><div class="rank-no">' + (i + 1) + '</div><div class="rank-main">' +
                '<a href="post.html?id=' + encodeURIComponent(t.id) + '" class="rank-title">' + esc(t.title) + "</a> " +
                '<span class="market-badge offer">' + esc(t.kind) + "</span>" + (t.status === "closed" ? ' <span class="market-badge closed">Closed</span>' : "") +
                '<div class="meta">Views ' + num(t.views) + " &bull; Chats " + num(t.enquiries) + " &bull; Sales " + num(t.sales) +
                " &bull; Likes " + num(t.likes) + " &bull; Comments " + num(t.comments) + "</div></div>" +
                '<div class="rank-money">' + money(t.revenue) + "</div></div>";
        }).join("");

    // Handouts
    const showHandouts = Number(h.sales_total) > 0 || data.role === "lecturer";
    document.getElementById("handoutPanel").style.display = showHandouts ? "" : "none";

    if (showHandouts) {
        document.getElementById("handouts").innerHTML =
            '<div class="kpi-grid">' +
            kpi("Sales", num(h.sales_period), num(h.sales_total) + " all time") +
            kpi("Earned after LBN's share", money(h.net_period), money(h.net_total) + " all time") + "</div>" +
            (data.top_handouts.length === 0 ? "<p class='meta'>No handout sales yet.</p>" : data.top_handouts.map(function (x) {
                return '<div class="funnel-row"><span>' + esc(x.title) + '</span><strong>' + num(x.sales) + " sold &bull; " + money(x.revenue) + "</strong></div>";
            }).join(""));
    }

    // History
    const rows = data.recent;
    document.getElementById("history").innerHTML = rows.length === 0
        ? "<p class='meta'>No transactions yet. They appear here when a buyer pays or a trade completes.</p>"
        : rows.map(function (r) {
            const payout = r.payout === "due" ? '<span class="badge trader">Payout due</span>' : r.payout === "paid" ? '<span class="badge lecturer">Paid out</span>' : "";

            return '<div class="tx-row"><div><strong>' + esc(r.title) + '</strong><div class="meta">' + (r.type === "handout" ? "Handout sale" : "Trade") +
                " &bull; " + esc(r.buyer || "Member") + " &bull; " + new Date(r.date).toLocaleDateString() + "</div>" +
                '<div class="meta">' + esc(STATUS_TEXT[r.status] || r.status) + " " + payout + "</div></div>" +
                '<div class="tx-money"><strong>' + money(r.net) + '</strong><div class="meta">of ' + money(r.amount) + "<br>fee " + money(r.fee) + "</div></div></div>";
        }).join("");

    renderInsights();
    showRatingKpi();
}

// Plain-language tips, worked out from the numbers above
function renderInsights() {
    const v = data.visits, p = data.posts, f = data.followers, q = data.enquiries, s = data.sales, m = data.pending, e = data.engagement;
    const tips = [];

    const views = Number(p.period), chats = Number(q.chats_period), sold = Number(s.completed_period);

    if (data.top_items.length === 0) {
        tips.push("You have not posted a product or service yet. Post one in the marketplace so buyers can find you.");
    }

    const visitChange = delta(v.period, v.previous);
    if (Number(v.previous) > 0 && visitChange.cls === "up") tips.push("More people are visiting your profile: " + visitChange.text + " compared with the period before. Keep posting.");
    if (Number(v.previous) > 0 && visitChange.cls === "down") tips.push("Fewer people visited your profile (" + visitChange.text + "). Posting a new photo or video usually brings visitors back.");

    if (views >= 20 && chats / views < 0.02) tips.push("Your items are being seen but few people start a chat. Try clear photos, a price and a longer description.");
    if (chats >= 5 && sold / chats < 0.2) tips.push("Many chats do not end in a sale. Reply quickly, and agree a delivery date in your offer so buyers feel safe.");

    const finished = Number(s.completed_total), lost = Number(s.cancelled);
    if (finished + lost >= 5 && lost / (finished + lost) > 0.3) tips.push("About " + Math.round((lost / (finished + lost)) * 100) + "% of your trades are cancelled or refunded. Be clear about what you offer to avoid this.");

    if (Number(m.awaiting_count) > 0) tips.push(num(m.awaiting_count) + " buyer(s) agreed a deal but have not paid yet. Remind them to use the Pay now button in the trade chat.");
    if (Number(m.payout_due) + Number(data.handouts.payout_due) > 0) tips.push("You have " + money(Number(m.payout_due) + Number(data.handouts.payout_due)) + " waiting to be paid out to you.");

    const best = data.top_items.find(function (t) { return Number(t.revenue) > 0; });
    if (best) tips.push('Your best seller is "' + best.title + '" with ' + money(best.revenue) + ". Consider posting similar items.");

    if (Number(f.new_period) > 0 && Number(f.previous) > 0 && Number(f.new_period) > Number(f.previous)) tips.push("You gained more followers than in the period before. People like what you post.");
    if (Number(f.total) < 10 && data.top_items.length > 0) tips.push("You have few followers. Follow and comment on other members, and they often follow back.");

    document.getElementById("insights").innerHTML = tips.length === 0 ? "" :
        '<section class="panel"><h2>Tips to grow</h2>' + tips.slice(0, 5).map(function (t) { return '<p class="insight">' + esc(t) + "</p>"; }).join("") + "</section>";
}

function downloadCsv() {
    const header = ["Date", "Type", "Item", "Buyer", "Amount", "LBN fee", "You receive", "Status", "Payout"];
    const lines = data.recent.map(function (r) {
        return [new Date(r.date).toISOString().slice(0, 10), r.type, r.title, r.buyer || "", r.amount, r.fee, r.net, r.status, r.payout]
            .map(function (cell) { return '"' + String(cell ?? "").replace(/"/g, '""') + '"'; }).join(",");
    });

    const blob = new Blob(["\uFEFF" + header.join(",") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lbn-transactions.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function load() {
    const note = document.getElementById("note");

    const { data: result, error } = await db.rpc("my_analytics", { p_days: days });

    if (error) {
        note.textContent = /could not find the function|schema cache/i.test(error.message)
            ? "Analytics needs its database update. Run supabase-analytics.sql in Supabase."
            : "Could not load your figures. " + error.message;
        return;
    }

    data = result;
    note.style.display = "none";
    document.getElementById("body").style.display = "block";
    render();
}

document.getElementById("rangeChips").addEventListener("click", function (event) {
    const chip = event.target.closest(".chip");
    if (!chip) return;

    document.querySelectorAll("#rangeChips .chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");

    days = parseInt(chip.dataset.days, 10);
    load();
});

document.getElementById("metricChips").addEventListener("click", function (event) {
    const chip = event.target.closest(".chip");
    if (!chip) return;

    document.querySelectorAll("#metricChips .chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");

    metric = chip.dataset.metric;
    if (data) drawChart();
});

document.getElementById("csvBtn").addEventListener("click", downloadCsv);

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

async function init() {
    if (!db) {
        document.getElementById("note").textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const session = (await db.auth.getSession()).data.session;

    if (!session) {
        window.location.href = "auth.html?next=analytics.html";
        return;
    }

    await load();
}

init();


async function showRatingKpi() {
    const session = (await db.auth.getSession()).data.session;
    if (!session) return;

    const { data } = await db.rpc("member_reputation", { p_user: session.user.id });
    const r = data && data[0];
    if (!r) return;

    document.getElementById("kpis").insertAdjacentHTML("beforeend",
        kpi("Your rating", r.seller_count > 0 ? "\u2605 " + Number(r.seller_avg).toFixed(1) : "-", num(r.seller_count) + " review(s)"));
}