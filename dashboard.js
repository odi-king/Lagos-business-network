let currentUser = null;
let profile = null;

const welcomeText = document.getElementById("welcomeText");
const roleBadge = document.getElementById("roleBadge");
const handoutList = document.getElementById("handoutList");
const handoutForm = document.getElementById("handoutForm");

function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatPrice(price) {
    return price > 0 ? "\u20A6" + Number(price).toLocaleString() : "Free";
}

async function init() {
    if (!db) {
        welcomeText.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const { data } = await db.auth.getSession();

    if (!data.session) {
        window.location.href = "auth.html";
        return;
    }

    currentUser = data.session.user;

    if (!(await hasActiveMembership(currentUser.id))) {
        window.location.href = "pay.html";
        return;
    }

    const result = await db
        .from("profiles")
        .select("full_name, role, approved, graduated, verified, is_admin")
        .eq("id", currentUser.id)
        .single();

    if (result.error || !result.data) {
        welcomeText.textContent = "We could not load your profile. Make sure you ran the SQL files in Supabase.";
        return;
    }

    profile = result.data;
    showRole();

    if (profile.is_admin) {
        const link = document.createElement("a");
        link.href = "admin.html";
        link.textContent = "Admin";
        const logout = document.getElementById("logoutBtn");
        logout.parentNode.insertBefore(link, logout);
    }
    await loadHandouts();

    if (profile.role === "lecturer" && profile.approved) {
        await loadMyClasses();
    }

    await loadPayout();

    if (profile.role === "student") {
        await loadGraduation();
    }
}

async function loadMyClasses() {
    const box = document.getElementById("myClasses");

    const { data, error } = await db
        .from("classes")
        .select("id, title, field")
        .eq("lecturer_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) {
        box.innerHTML = "<p>Could not load your classes. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        box.innerHTML = "<p class='meta'>You have not created a class yet. Tap Create a new class to start.</p>";
        return;
    }

    box.innerHTML = "";

    data.forEach(function (item) {
        const id = encodeURIComponent(item.id);
        const card = document.createElement("div");
        card.className = "business-card";

        card.innerHTML = `
            <h3>${escapeHTML(item.title)}</h3>
            <p class="meta">${escapeHTML(item.field)}</p>
            <a class="contact-btn" href="class.html?id=${id}#addLesson">Add video lesson</a>
            <a class="contact-btn" href="class.html?id=${id}#addLive">Schedule live class</a>
            <a class="btn btn-outline" style="margin:10px 8px 0 0;" href="class.html?id=${id}">Open class</a>
        `;

        box.appendChild(card);
    });
}

function showRole() {
    const name = profile.full_name || currentUser.email;
    const isLecturer = profile.role === "lecturer";

    welcomeText.textContent = "Welcome, " + name + ".";

    if (profile.role === "business") {
        roleBadge.textContent = profile.approved ? "\u2713 Verified business" : "Business (pending)";
        roleBadge.className = "badge business";

        const notice = document.getElementById("pendingNotice");
        notice.textContent = "Your business account is waiting for approval. The LBN team checks every business. The marketplace opens as soon as it is approved.";
        notice.style.display = profile.approved ? "none" : "block";
    } else if (isLecturer) {
        roleBadge.textContent = profile.approved ? "\u2713 Verified lecturer" : "Lecturer (pending)";
        roleBadge.className = "badge lecturer";
        document.getElementById("pendingNotice").style.display = profile.approved ? "none" : "block";
        document.getElementById("lecturerPanel").style.display = profile.approved ? "block" : "none";
        document.getElementById("teachPanel").style.display = profile.approved ? "block" : "none";
    } else {
        roleBadge.textContent = profile.verified ? "\u2713 Verified trader" : profile.graduated ? "Graduate" : "Student";
        roleBadge.className = profile.verified ? "badge trader" : "badge";
        document.getElementById("studentPanel").style.display = "block";
        document.getElementById("graduationPanel").style.display = "block";
    }

    if (profile.is_admin) {
        roleBadge.textContent = "\u2605 Administrator";
        roleBadge.className = "badge admin";
    }
}

async function loadHandouts() {
    const { data, error } = await db
        .from("handouts")
        .select("*, profiles(full_name)")
        .order("created_at", { ascending: false });

    if (error) {
        handoutList.innerHTML = "<p>Could not load the library. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        handoutList.innerHTML = "<p class='meta'>Nothing here yet.</p>";
        return;
    }

    handoutList.innerHTML = "";

    data.forEach(function (item) {
        const card = document.createElement("div");
        card.className = "business-card";

        const lecturerName = item.profiles ? item.profiles.full_name : "Lecturer";
        const deleteButton = item.lecturer_id === currentUser.id
            ? '<button type="button" class="delete-btn" data-id="' + escapeHTML(item.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(item.title)}</h3>
            <p class="meta">${escapeHTML(item.kind)} by ${escapeHTML(lecturerName)}</p>
            <p>${escapeHTML(item.description)}</p>
            <p><strong>${formatPrice(item.price)}</strong></p>
            ${deleteButton}
        `;

        handoutList.appendChild(card);
    });
}

if (handoutForm) {
    handoutForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = handoutForm.querySelector("button[type='submit']");
        submitButton.disabled = true;

        const file = document.getElementById("handoutFile").files[0];

        if (!file || file.size > 20 * 1024 * 1024) {
            submitButton.disabled = false;
            alert(!file ? "Please choose the file you want to sell." : "That file is larger than 20 MB.");
            return;
        }

        const handoutId = newId();
        const filePath = currentUser.id + "/" + handoutId + "/" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

        const upload = await db.storage.from("handout-files").upload(filePath, file, {
            contentType: file.type || "application/octet-stream"
        });

        if (upload.error) {
            submitButton.disabled = false;
            alert("Could not upload the file: " + upload.error.message);
            return;
        }

        const { error } = await db.rpc("create_handout", {
            p_id: handoutId,
            p_title: document.getElementById("handoutTitle").value.trim(),
            p_kind: document.getElementById("handoutKind").value,
            p_price: Number(document.getElementById("handoutPrice").value),
            p_description: document.getElementById("handoutDesc").value.trim(),
            p_file_path: filePath,
            p_file_name: file.name,
            p_file_size: file.size
        });

        if (error) {
            await db.storage.from("handout-files").remove([filePath]);
        }

        submitButton.disabled = false;

        if (error) {
            alert("Could not add it: " + error.message);
            return;
        }

        handoutForm.reset();
        await loadHandouts();
    });
}

handoutList.addEventListener("click", async function (event) {
    const button = event.target.closest(".delete-btn");
    if (!button) return;

    if (!confirm("Delete this item?")) return;

    const { data, error } = await db
        .from("handouts")
        .delete()
        .eq("id", button.dataset.id)
        .select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this item.");
        return;
    }

    await loadHandouts();
});


// ---------- Path to graduation ----------

function progressRow(label, done, needed) {
    const percent = needed === 0 ? 100 : Math.min(100, Math.round(done * 100 / needed));

    return '<div class="progress-row"><div class="progress-label"><span>' + label + "</span><span>" +
        done + " of " + needed + '</span></div><div class="progress"><div class="bar" style="width:' + percent + '%"></div></div></div>';
}

async function loadGraduation() {
    const body = document.getElementById("gradBody");
    const result = await db.rpc("my_graduation_eligibility");

    // Until supabase-eligibility.sql is run, this shows a short "not available yet" message
    if (result.error || !result.data) {
        body.innerHTML = "<p class='meta'>Your progress is not available yet.</p>";
        return;
    }

    const g = result.data;

    if (g.graduated) {
        body.innerHTML = "<p><strong>You have graduated.</strong> The marketplace is open to you.</p>";
        return;
    }

    const ready = !!g.eligible;

    let action = "";

    if (g.pending) {
        action = "<p class='notice'>Your request is waiting for review by the LBN team.</p>";
    } else if (ready) {
        action =
            '<h3>Your graduation application</h3>' +
            '<p class="meta">The LBN team uses these details for your certificate and your graduation gift package. Only you and the LBN team can see them.</p>' +
            '<input type="text" id="gradName" maxlength="80" placeholder="Full name for the certificate" autocomplete="name">' +
            '<input type="tel" id="gradPhone" maxlength="20" placeholder="Phone number (for delivery)" autocomplete="tel">' +
            '<input type="text" id="gradAddress" maxlength="200" placeholder="Delivery address (house number, street, area)" autocomplete="street-address">' +
            '<input type="text" id="gradCity" maxlength="60" placeholder="City or town" autocomplete="address-level2">' +
            '<input type="text" id="gradState" maxlength="60" placeholder="State" autocomplete="address-level1">' +
            '<input type="text" id="gradCountry" maxlength="60" placeholder="Country" value="Nigeria" autocomplete="country-name">' +
            '<select id="gradShirt"><option value="" disabled selected>Shirt size</option>' +
            '<option>S</option><option>M</option><option>L</option><option>XL</option><option>XXL</option><option>XXXL</option></select>' +
            '<textarea id="gradNote" placeholder="Anything you want the team to know (optional)" maxlength="300"></textarea>' +
            '<button type="button" id="gradRequestBtn" class="contact-btn">Ask to graduate</button>' +
            '<p id="gradMsg" class="msg"></p>';
    } else {
        action = "<p class='meta'>Keep going. When every bar below is full, you can ask to graduate here.</p>";
    }

    if (!g.pending && g.last_status === "declined") {
        action = "<p class='notice'>Your last request was not approved." + (g.last_note ? " " + escapeHTML(g.last_note) : "") +
            " Keep learning and ask again.</p>" + action;
    }

    const materials = (g.materials || []).map(function (m) {
        return "<div class='comment'>" + (m.have ? "\u2713 " : "\u2022 ") + escapeHTML(m.title) +
            " <span class='meta'>(" + escapeHTML(m.kind) + (m.have ? ", you have it" : ", get it in the Library") + ")</span></div>";
    }).join("");

    const days = (g.days || []).slice(0, 10).map(function (d) {
        return "<div class='comment'>" + new Date(d.day + "T12:00:00").toLocaleDateString() + ": " + d.lectures +
            (d.lectures === 1 ? " lecture" : " lectures") + " from " + d.lecturers + (d.lecturers === 1 ? " lecturer" : " lecturers") +
            (d.counts ? " <strong>\u2713 counted</strong>" : " <span class='meta'>(not counted: you need " + g.min_day_lecturers + " different lecturers on a day)</span>") + "</div>";
    }).join("");

    body.innerHTML =
        progressRow("Lectures counted", Number(g.lectures), g.min_lectures) +
        progressRow("Assessments passed", Number(g.assessments_passed), g.min_assessments) +
        (g.materials_total > 0 ? progressRow("Required books and handouts", Number(g.materials_have), g.materials_total) + materials : "") +
        '<p class="meta">A lecture counts when you type the live class code, or watch an uploaded video to the end. ' +
        "A day counts only if you had lectures from at least " + g.min_day_lecturers + " different lecturers that day.</p>" +
        (days ? '<details class="faq"><summary>Your recent days</summary>' + days + "</details>" : "") +
        action +
        '<div id="myAssessments"></div>';

    const request = document.getElementById("gradRequestBtn");

    if (request) {
        request.addEventListener("click", async function () {
            request.disabled = true;

            const { error } = await db.rpc("request_graduation_v2", {
                p_note: document.getElementById("gradNote").value,
                p_name: document.getElementById("gradName").value,
                p_phone: document.getElementById("gradPhone").value,
                p_address: document.getElementById("gradAddress").value,
                p_city: document.getElementById("gradCity").value,
                p_state: document.getElementById("gradState").value,
                p_country: document.getElementById("gradCountry").value,
                p_shirt: document.getElementById("gradShirt").value
            });

            if (error) {
                const message = document.getElementById("gradMsg");
                message.className = "msg error";
                message.textContent = error.message;
                request.disabled = false;
                return;
            }

            await loadGraduation();
        });
    }

    const mine = await db.rpc("my_assessments");
    const box = document.getElementById("myAssessments");

    if (box && mine.data && mine.data.length > 0) {
        box.innerHTML = "<h3>Your assessments</h3>" + mine.data.map(function (a) {
            return "<div class='comment'><strong>" + (a.result === "passed" ? "Passed" : "Not yet") + "</strong> \u2022 " +
                escapeHTML(a.title) + " <span class='meta'>(" + escapeHTML(a.class_title) + ", " +
                escapeHTML(a.lecturer_name || "Lecturer") + ")</span>" +
                (a.note ? " \u2022 " + escapeHTML(a.note) : "") + "</div>";
        }).join("");
    }
}

// ---------- Payout account ----------

async function loadPayout() {
    const { data } = await db
        .from("payout_accounts")
        .select("bank_name, account_number, account_name")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    const saved = document.getElementById("payoutSaved");
    if (!saved) return;

    saved.textContent = data
        ? "Saved: " + data.bank_name + ", account ending " + data.account_number.slice(-4) + " (" + data.account_name + ")"
        : "No payout account saved yet.";
}

const payoutForm = document.getElementById("payoutForm");

if (payoutForm) {
    payoutForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const message = document.getElementById("payoutMsg");
        message.className = "msg";
        message.textContent = "Please wait...";

        const { error } = await db.rpc("save_payout_account", {
            p_bank: document.getElementById("payoutBank").value,
            p_number: document.getElementById("payoutNumber").value,
            p_name: document.getElementById("payoutName").value
        });

        if (error) {
            message.className = "msg error";
            message.textContent = error.message;
            return;
        }

        payoutForm.reset();
        message.className = "msg ok";
        message.textContent = "Saved.";
        await loadPayout();
    });
}

function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();