// LBN Phase 13D: Admin Route Lock. Every admin page asks the SERVER whether this person may be here.
// If not, the page content is removed. (The database functions behind each button also check on the server.)
(function () {
    function show(title, text) {
        const m = document.querySelector("main");
        if (!m) return;
        m.innerHTML = '<section class="panel"><h2>' + title + '</h2><p class="meta">' + text + '</p><a href="dashboard.html" class="btn btn-primary" style="margin-top:10px;">Back to dashboard</a></section>';
    }

    async function check() {
        if (typeof db === "undefined" || !db) return;
        const page = location.pathname.split("/").pop() || "";
        try {
            const r = await db.rpc("sec_admin_page_check", { p_page: page });
            if (r.error) return; // the security files are not installed yet: the page's own checks still apply
            if (r.data === "login") { location.href = "auth.html?next=" + encodeURIComponent(page); return; }
            if (r.data === "denied") show("Not allowed", "This page is only for the LBN admin team. This visit has been recorded.");
            if (r.data === "mfa") show("Two-step code needed", "Please log out and log in again, then enter your two-step code. Admin pages stay locked until you do.");
        } catch (e) { /* never break the page */ }
    }

    window.addEventListener("load", function () { setTimeout(check, 50); });
})();