// "Become an Ambassador" card for logged-in members. Shows on the dashboard, Lifestyle and profile pages.
// It hides itself for people who already applied, hold a position, or closed it.
(async function () {
    try {
        if (typeof db === "undefined" || !db) return;
        if (localStorage.getItem("lbn_amb_banner_closed") === "1") return;

        const { data: sessionData } = await db.auth.getSession();
        if (!sessionData.session) return;

        const { data, error } = await db.rpc("my_ambassador_status");
        if (error || !data || data.state !== "open") return;

        const main = document.querySelector("main");
        if (!main || document.getElementById("ambBanner")) return;

        const box = document.createElement("section");
        box.id = "ambBanner";
        box.className = "panel";
        box.innerHTML =
            '<h2 style="margin-top:0;">Become an LBN Ambassador</h2>' +
            '<p class="meta" style="margin:4px 0 10px;">Earn a monthly stipend, an Ambassador badge and an official certificate for your CV.</p>' +
            '<a class="contact-btn" href="ambassador-apply.html">Apply Now</a> ' +
            '<a class="btn btn-outline" href="ambassadors.html">Learn more</a> ' +
            '<button type="button" class="btn btn-outline" id="ambBannerClose" aria-label="Hide this card">Not now</button>';

        main.insertBefore(box, main.firstChild);

        document.getElementById("ambBannerClose").addEventListener("click", function () {
            try { localStorage.setItem("lbn_amb_banner_closed", "1"); } catch (e) {}
            box.remove();
        });
    } catch (e) {}
})();