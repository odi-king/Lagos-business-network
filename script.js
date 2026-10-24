let currentUser = null;
let allBusinesses = [];

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const businessForm = document.getElementById("businessForm");
const businessList = document.getElementById("registeredBusinessList");

// Stops user-typed text from being treated as HTML
function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------- Start: only logged-in people can see this page ----------

async function init() {
    if (!db) {
        businessList.innerHTML = "<p>Supabase is not connected yet. Paste your Project URL and anon key into supabase-config.js, then refresh.</p>";
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

    const profileResult = await db
        .from("profiles")
        .select("role, approved, graduated, is_admin")
        .eq("id", currentUser.id)
        .single();

    const me = profileResult.data;
    const allowed = me && (
        me.is_admin ||
        (me.role === "lecturer" && me.approved) ||
        (me.role === "student" && me.graduated)
    );

    if (!allowed) {
        const waiting = me && me.role === "lecturer";
        document.querySelector("main").innerHTML = `
            <div class="page-head"><h1>Marketplace</h1></div>
            <section class="panel">
                <h2>The marketplace is not open to you yet</h2>
                <p class="meta">${waiting
                    ? "Your lecturer account is still being verified. The marketplace opens as soon as it is approved."
                    : "Students unlock the marketplace after finishing the one-year program."}</p>
                <a href="classes.html" class="btn btn-primary" style="margin-top:10px;">Go to classes</a>
            </section>`;
        return;
    }

    const welcome = document.getElementById("welcomeText");
    if (welcome) {
        const name = currentUser.user_metadata.full_name || currentUser.email;
        welcome.textContent = "Welcome, " + name + ". Register your business and find others to work with.";
    }

    await Promise.all([loadBusinesses(), loadVideos()]);
}

// ---------- Load and show businesses ----------

async function loadBusinesses() {
    const { data, error } = await db
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        businessList.innerHTML = "<p>Could not load businesses. " + escapeHTML(error.message) + "</p>";
        return;
    }

    allBusinesses = data;
    renderBusinesses();
}

function renderBusinesses() {
    const searchText = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value.toLowerCase();

    const visible = allBusinesses.filter(function (business) {
        const matchesSearch = business.name.toLowerCase().includes(searchText);
        const matchesCategory =
            selectedCategory === "all" ||
            business.category.toLowerCase() === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    if (visible.length === 0) {
        businessList.innerHTML = "<p>No businesses found.</p>";
        return;
    }

    businessList.innerHTML = "";

    visible.forEach(function (business) {
        const card = document.createElement("div");
        card.className = "business-card";

        // Only the owner sees the delete button
        const deleteButton = business.owner_id === currentUser.id
            ? '<button type="button" class="delete-btn" data-id="' + escapeHTML(business.id) + '">Delete Business</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(business.name)}</h3>
            <p>Category: ${escapeHTML(business.category)}</p>
            <p>Location: ${escapeHTML(business.location)}</p>
            <p>Phone: ${escapeHTML(business.phone)}</p>
            <p>Contact: ${escapeHTML(business.email)}</p>
            <a href="mailto:${escapeHTML(business.email)}" class="contact-btn">Email Business</a>
            <a href="tel:${escapeHTML(business.phone)}" class="contact-btn">Call Business</a>
            ${deleteButton}
        `;

        businessList.appendChild(card);
    });
}

searchInput.addEventListener("input", renderBusinesses);
categoryFilter.addEventListener("change", renderBusinesses);

// ---------- Register a business ----------

businessForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const submitButton = businessForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    const business = {
        name: document.getElementById("businessName").value.trim(),
        category: document.getElementById("businessCategory").value.trim(),
        location: document.getElementById("businessLocation").value.trim(),
        phone: document.getElementById("businessPhone").value.trim(),
        email: document.getElementById("businessEmail").value.trim()
    };

    const { error } = await db.from("businesses").insert(business);

    submitButton.disabled = false;

    if (error) {
        alert("Could not register business: " + error.message);
        return;
    }

    businessForm.reset();
    await loadBusinesses();
    alert("Business registered successfully!");
});

// ---------- Delete a business ----------

businessList.addEventListener("click", async function (event) {
    const button = event.target.closest(".delete-btn");
    if (!button) return;

    if (!confirm("Are you sure you want to delete this business?")) return;

    const { data, error } = await db
        .from("businesses")
        .delete()
        .eq("id", button.dataset.id)
        .select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this business.");
        return;
    }

    allBusinesses = allBusinesses.filter(function (business) {
        return business.id !== button.dataset.id;
    });
    renderBusinesses();
    alert("Business deleted successfully!");
});

// ---------- Log out ----------

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", async function (event) {
        event.preventDefault();
        await db.auth.signOut();
        window.location.href = "auth.html";
    });
}

// ---------- Business videos ----------

const videoList = document.getElementById("videoList");
const videoForm = document.getElementById("videoForm");

async function loadVideos() {
    const { data, error } = await db
        .from("business_videos")
        .select("*, profiles(full_name, role, approved, verified, is_admin)")
        .order("created_at", { ascending: false });

    if (error) {
        videoList.innerHTML = "<p>Could not load videos. " + escapeHTML(error.message) + "</p>";
        return;
    }

    if (data.length === 0) {
        videoList.innerHTML = "<p class='meta'>No business videos yet.</p>";
        return;
    }

    videoList.innerHTML = "";

    data.forEach(function (item) {
        const embed = toEmbedUrl(item.video_url);
        const owner = item.profiles && item.profiles.full_name ? item.profiles.full_name : "Member";
        const card = document.createElement("div");
        card.className = "business-card";

        const watch = embed
            ? '<button type="button" class="contact-btn watch-btn" data-embed="' + escapeHTML(embed) + '">Watch</button>'
            : '<a class="contact-btn" target="_blank" rel="noopener" href="' + escapeHTML(item.video_url) + '">Open video</a>';

        const remove = item.owner_id === currentUser.id
            ? '<button type="button" class="delete-btn" data-video-id="' + escapeHTML(item.id) + '">Delete</button>'
            : "";

        card.innerHTML = `
            <h3>${escapeHTML(item.title)}</h3>
            <p><span class="badge lecturer" style="margin-left:0;">${escapeHTML(item.category)}</span></p>
            <p class="meta">By ${escapeHTML(owner)}${badgeHTML(item.profiles)}</p>
            <p>${escapeHTML(item.description)}</p>
            <div class="video-slot"></div>
            ${watch}
            ${remove}
        `;

        videoList.appendChild(card);
    });
}

videoList.addEventListener("click", async function (event) {
    const watchButton = event.target.closest(".watch-btn");

    if (watchButton) {
        const slot = watchButton.parentElement.querySelector(".video-slot");

        if (slot.firstChild) {
            slot.innerHTML = "";
            watchButton.textContent = "Watch";
            return;
        }

        const wrap = document.createElement("div");
        wrap.className = "video-wrap";

        const frame = document.createElement("iframe");
        frame.src = watchButton.dataset.embed;
        frame.loading = "lazy";
        frame.allowFullscreen = true;
        frame.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");

        wrap.appendChild(frame);
        slot.appendChild(wrap);
        watchButton.textContent = "Close video";
        return;
    }

    const deleteButton = event.target.closest(".delete-btn");
    if (!deleteButton || !deleteButton.dataset.videoId) return;

    if (!confirm("Delete this video?")) return;

    const { data, error } = await db
        .from("business_videos")
        .delete()
        .eq("id", deleteButton.dataset.videoId)
        .select();

    if (error || !data || data.length === 0) {
        alert("Could not delete this video.");
        return;
    }

    await loadVideos();
});

videoForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const link = document.getElementById("videoUrl").value.trim();

    if (!toEmbedUrl(link)) {
        alert("Please use a YouTube, Vimeo or Google Drive link.");
        return;
    }

    const button = videoForm.querySelector("button[type='submit']");
    button.disabled = true;

    const { error } = await db.from("business_videos").insert({
        title: document.getElementById("videoTitle").value.trim(),
        category: document.getElementById("videoCategory").value,
        video_url: link,
        description: document.getElementById("videoDesc").value.trim()
    });

    button.disabled = false;

    if (error) {
        alert("Could not add the video: " + error.message);
        return;
    }

    videoForm.reset();
    await loadVideos();
});

init();