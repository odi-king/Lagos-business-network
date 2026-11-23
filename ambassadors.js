function escapeHTML(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

var logoutLink = document.getElementById("logoutBtn");
if (logoutLink) {
    logoutLink.addEventListener("click", async function (event) {
        event.preventDefault();
        if (db) await db.auth.signOut();
        window.location.href = "auth.html";
    });
}

const TYPE_LABEL = { business: "Business Owners", student: "Students", lecturer: "Lecturers" };

async function loadVacancies() {
    const box = document.getElementById("vacancyList");

    if (!db) {
        box.innerHTML = "<p class='meta'>Not available right now.</p>";
        return;
    }

    const { data, error } = await db.rpc("ambassador_vacancies");

    if (error) {
        box.innerHTML = "<p class='meta'>Open places will show here soon.</p>";
        return;
    }

    if (!data || data.length === 0) {
        box.innerHTML = "<p class='meta'>No schools are taking part yet. Please check back soon.</p>";
        return;
    }

    const schools = {};
    data.forEach(function (row) {
        (schools[row.school_id] = schools[row.school_id] || { name: row.school_name, country: row.country, rows: [] }).rows.push(row);
    });

    box.innerHTML = Object.keys(schools).map(function (id) {
        const s = schools[id];

        return '<div class="staff-card"><strong>' + escapeHTML(s.name) + '</strong> <span class="meta">' + escapeHTML(s.country) + "</span>" +
            s.rows.map(function (r) {
                const full = r.open_places <= 0;
                return "<p>" + escapeHTML(TYPE_LABEL[r.ambassador_type]) + ": " +
                    (full ? "<strong>Fully occupied</strong>" : "<strong>" + r.open_places + " open</strong> of " + r.capacity) +
                    ' <span class="meta">(' + r.confirmed + " confirmed" + (r.in_trial ? ", " + r.in_trial + " on trial" : "") + ")</span></p>";
            }).join("") + "</div>";
    }).join("");
}

loadVacancies();