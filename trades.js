let me = null;
let trades = [];

const tradeList = document.getElementById("tradeList");
const tradeFilter = document.getElementById("tradeFilter");

const STATUS_LABELS = {
    negotiating: "Negotiating",
    agreed: "Deal agreed",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled"
};

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function init() {
    if (!db) {
        tradeList.innerHTML = "<p>Supabase is not connected yet. Check supabase-config.js.</p>";
        return;
    }

    const { data } = await db.auth.getSession();
    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    me = data.session.user;

    if (!(await hasActiveMembership(me.id))) {
        window.location.href = "pay.html";
        return;
    }

    const result = await db
        .from("trades")
        .select("*, buyer:profiles!trades_buyer_id_fkey(full_name), seller:profiles!trades_seller_id_fkey(full_name)")
        .order("updated_at", { ascending: false });

    if (result.error) {
        tradeList.innerHTML = "<p>Could not load your trades. " + escapeHTML(result.error.message) + "</p>";
        return;
    }

    trades = result.data;
    render();
}

function render() {
    const filter = tradeFilter.value;

    const visible = trades.filter(function (t) {
        const closed = t.status === "completed" || t.status === "cancelled";
        if (filter === "active") return !closed;
        if (filter === "closed") return closed;
        return true;
    });

    if (visible.length === 0) {
        tradeList.innerHTML = "<p class='meta'>No trades here yet.</p>";
        return;
    }

    tradeList.innerHTML = "";

    visible.forEach(function (t) {
        const buyerName = t.buyer && t.buyer.full_name ? t.buyer.full_name : "Member";
        const sellerName = t.seller && t.seller.full_name ? t.seller.full_name : "Member";

        let who;
        if (t.buyer_id === me.id) {
            who = "You are buying from " + sellerName;
        } else if (t.seller_id === me.id) {
            who = "You are selling to " + buyerName;
        } else {
            who = "Buyer " + buyerName + " \u2022 Seller " + sellerName;
        }

        const amount = t.agreed_amount ? " \u2022 \u20A6" + Number(t.agreed_amount).toLocaleString() : "";

        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${escapeHTML(t.business_name)}</h3>
            <p class="meta">${escapeHTML(who)}</p>
            <p class="meta">${escapeHTML(STATUS_LABELS[t.status] || t.status)}${amount} \u2022 Updated ${new Date(t.updated_at).toLocaleString()}</p>
            <a class="contact-btn" href="trade.html?id=${encodeURIComponent(t.id)}">Open chat</a>
        `;

        tradeList.appendChild(card);
    });
}

tradeFilter.addEventListener("change", render);

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();