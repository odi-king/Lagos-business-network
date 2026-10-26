let me = null;
let paymentsOn = false;
let currentTab = "browse";
let handouts = [];

const browseList = document.getElementById("browseList");
const purchasesList = document.getElementById("purchasesList");
const salesList = document.getElementById("salesList");
const libNote = document.getElementById("libNote");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function money(amount) {
    return Number(amount) === 0 ? "Free" : "\u20A6" + Number(amount).toLocaleString();
}

function fileSize(bytes) {
    if (!bytes) return "";
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function toast(text) {
    const box = document.createElement("div");
    box.className = "toast";
    box.textContent = text;
    document.body.appendChild(box);

    setTimeout(function () { box.classList.add("show"); }, 10);
    setTimeout(function () {
        box.classList.remove("show");
        setTimeout(function () { box.remove(); }, 300);
    }, 2600);
}

function showTab(name) {
    currentTab = name;

    document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.toggle("active", b.dataset.tab === name);
    });

    document.getElementById("browsePane").style.display = name === "browse" ? "" : "none";
    document.getElementById("purchasesPane").style.display = name === "purchases" ? "" : "none";
    document.getElementById("salesPane").style.display = name === "sales" ? "" : "none";
}

async function init() {
    if (!db) {
        libNote.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html?next=" + encodeURIComponent("library.html");
        return;
    }

    me = data.session.user;

    if (!(await hasActiveMembership(me.id))) {
        window.location.href = "pay.html";
        return;
    }

    const profile = await db.from("profiles").select("role").eq("id", me.id).maybeSingle();

    if (profile.data && profile.data.role === "lecturer") {
        document.getElementById("salesTab").style.display = "";
    }

    const flag = await db.rpc("trade_payments_enabled");
    paymentsOn = !flag.error && flag.data === true;

    const wanted = window.location.hash.replace("#", "");
    if (wanted === "purchases" || wanted === "sales") showTab(wanted);

    await Promise.all([loadBrowse(), loadPurchases(), loadSales()]);
}

// ---------- Browse ----------

async function loadBrowse() {
    const { data, error } = await db.rpc("library_handouts", {
        p_search: document.getElementById("searchBox").value,
        p_kind: document.getElementById("kindFilter").value || null
    });

    if (error) {
        browseList.innerHTML = "<p>Could not load the library. " + escapeHTML(error.message) + "</p>";
        return;
    }

    handouts = data;

    if (data.length === 0) {
        browseList.innerHTML = "<p class='meta'>Nothing here yet.</p>";
        return;
    }

    browseList.innerHTML = "";

    data.forEach(function (h) {
        const card = document.createElement("div");
        card.className = "business-card";

        let action = "";

        if (h.is_mine || h.owned) {
            action = '<button type="button" class="contact-btn download-btn" data-path="' + escapeHTML(h.file_path) +
                '" data-name="' + escapeHTML(h.file_name) + '">Download</button>';
            if (h.is_mine) {
                action += ' <button type="button" class="delete-btn remove-handout" data-id="' + escapeHTML(h.id) +
                    '" data-path="' + escapeHTML(h.file_path) + '">Remove</button>';
            }
        } else if (Number(h.price) === 0) {
            action = '<button type="button" class="contact-btn free-btn" data-id="' + escapeHTML(h.id) + '">Get it free</button>';
        } else if (paymentsOn) {
            action = '<button type="button" class="contact-btn buy-btn" data-id="' + escapeHTML(h.id) +
                '" data-price="' + Number(h.price) + '">Buy for ' + money(h.price) + "</button>";
        } else {
            action = "<p class='meta'>Buying opens soon.</p>";
        }

        card.innerHTML = `
            <h3>${escapeHTML(h.title)} <span class="badge">${h.kind === "book" ? "Book" : "Handout"}</span></h3>
            <p class="meta">By ${escapeHTML(h.lecturer_name || "Lecturer")}${badgeHTML({ role: h.lecturer_role, approved: h.lecturer_approved })}</p>
            ${h.description ? "<p>" + escapeHTML(h.description) + "</p>" : ""}
            <p class="meta">${escapeHTML(h.file_name || "")} ${fileSize(h.file_size)}</p>
            <div class="post-price" style="margin-left:0;">${money(h.price)}</div>
            <div style="margin-top:10px;">${action}</div>
        `;

        browseList.appendChild(card);
    });
}

let searchTimer = null;

document.getElementById("searchBox").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadBrowse, 300);
});

document.getElementById("kindFilter").addEventListener("change", loadBrowse);

// ---------- My purchases ----------

async function loadPurchases() {
    const { data, error } = await db.rpc("my_purchases");

    if (error) {
        purchasesList.innerHTML = "<p>Could not load your purchases. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        purchasesList.innerHTML = "<p class='meta'>You have not bought anything yet.</p>";
        return;
    }

    purchasesList.innerHTML = "";

    data.forEach(function (p) {
        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${escapeHTML(p.handout_title)}</h3>
            <p class="meta">By ${escapeHTML(p.lecturer_name || "Lecturer")} &bull; ${money(p.amount)} &bull; ${new Date(p.created_at).toLocaleDateString()}</p>
            ${p.file_path
                ? '<button type="button" class="contact-btn download-btn" data-path="' + escapeHTML(p.file_path) + '" data-name="' + escapeHTML(p.file_name) + '">Download</button>'
                : ""}
        `;

        purchasesList.appendChild(card);
    });
}

// ---------- My sales (lecturers) ----------

async function loadSales() {
    const { data, error } = await db.rpc("my_sales");

    if (error || !data) return;

    if (data.length === 0) {
        document.getElementById("salesSummary").innerHTML = "";
        salesList.innerHTML = "<p class='meta'>No sales yet. When a student buys one of your handouts, you see their name here and in your notifications.</p>";
        return;
    }

    const earned = data.reduce(function (sum, s) { return sum + Number(s.lecturer_amount); }, 0);
    const waiting = data.filter(function (s) { return s.payout_status === "due"; })
        .reduce(function (sum, s) { return sum + Number(s.lecturer_amount); }, 0);

    document.getElementById("salesSummary").innerHTML =
        '<div class="profile-stats">' +
        "<div><strong>" + data.length + "</strong>sales</div>" +
        "<div><strong>" + money(earned) + "</strong>your share</div>" +
        "<div><strong>" + money(waiting) + "</strong>waiting to be paid</div></div>";

    salesList.innerHTML = "";

    data.forEach(function (s) {
        const card = document.createElement("div");
        card.className = "business-card";

        const status = s.payout_status === "paid" ? "Paid to you"
            : s.payout_status === "due" ? "Waiting to be paid to you" : "Free copy";

        card.innerHTML = `
            <h3>${escapeHTML(s.handout_title)}</h3>
            <p><strong>${escapeHTML(s.buyer_name || "A student")}</strong> bought this on ${new Date(s.created_at).toLocaleDateString()}</p>
            <p class="meta">Price ${money(s.amount)} &bull; LBN fee ${money(s.fee_amount)} &bull; your share ${money(s.lecturer_amount)}</p>
            <p class="meta">${status}</p>
        `;

        salesList.appendChild(card);
    });
}

// ---------- Buttons ----------

async function downloadFile(path, name) {
    const { data, error } = await db.storage.from("handout-files").createSignedUrl(path, 120, { download: name || true });

    if (error) {
        alert("Could not open the file. " + error.message);
        return;
    }

    window.location.href = data.signedUrl;
}

async function waitForPurchase(id) {
    toast("Payment received. Getting your file ready...");

    for (let i = 0; i < 20; i++) {
        await loadBrowse();

        if (handouts.find(function (h) { return h.id === id && h.owned; })) {
            await loadPurchases();
            showTab("purchases");
            toast("Your file is ready to download");
            return;
        }

        await new Promise(function (resolve) { setTimeout(resolve, 2000); });
    }

    toast("Payment received. If the file is not here in a minute, refresh this page.");
}

document.addEventListener("click", async function (event) {
    const target = event.target;

    const download = target.closest(".download-btn");
    if (download) {
        await downloadFile(download.dataset.path, download.dataset.name);
        return;
    }

    const free = target.closest(".free-btn");
    if (free) {
        free.disabled = true;

        const { error } = await db.rpc("claim_free_handout", { p_handout_id: free.dataset.id });

        if (error) {
            alert(error.message);
            free.disabled = false;
            return;
        }

        await Promise.all([loadBrowse(), loadPurchases()]);
        showTab("purchases");
        toast("Added to My purchases");
        return;
    }

    const buy = target.closest(".buy-btn");
    if (buy) {
        if (typeof PAYSTACK_PUBLIC_KEY === "undefined" || PAYSTACK_PUBLIC_KEY.indexOf("PASTE") === 0) {
            alert("Payments are not set up yet. The Paystack key is missing.");
            return;
        }

        if (typeof PaystackPop === "undefined") {
            alert("The payment window could not load. Check your internet and try again.");
            return;
        }

        const id = buy.dataset.id;

        PaystackPop.setup({
            key: PAYSTACK_PUBLIC_KEY,
            email: me.email,
            amount: Number(buy.dataset.price) * 100, // Paystack counts in kobo
            currency: "NGN",
            ref: "HND-" + id.slice(0, 8) + "-" + Date.now(),
            metadata: { kind: "handout", handout_id: id, buyer_id: me.id },
            callback: function () { waitForPurchase(id); },
            onClose: function () {}
        }).openIframe();

        return;
    }

    const remove = target.closest(".remove-handout");
    if (remove) {
        if (!confirm("Remove this handout from the library?")) return;

        const { data, error } = await db.rpc("delete_handout", { p_id: remove.dataset.id });

        if (error) {
            alert(error.message);
            return;
        }

        if (data === "deleted" && remove.dataset.path) {
            await db.storage.from("handout-files").remove([remove.dataset.path]);
        }

        toast(data === "hidden" ? "Hidden. People who bought it keep their copy." : "Removed");
        await loadBrowse();
        return;
    }

    const tab = target.closest(".tab-btn[data-tab]");
    if (tab) showTab(tab.dataset.tab);
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();