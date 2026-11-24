// LBN Phase 7H: a one-time congratulations screen for a new graduate. Works with supabase-celebrate.sql.

(function () {
    if (typeof db === "undefined" || !db) return;

    function esc(text) {
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    async function start() {
        let session;

        try {
            session = (await db.auth.getSession()).data.session;
        } catch (e) {
            return;
        }

        if (!session) return;

        const result = await db.rpc("my_graduation_celebration");

        // Not graduated, already celebrated, or the database update has not been run: show nothing
        if (result.error || !result.data) return;

        const c = result.data;
        const verifyLink = location.origin + location.pathname.replace(/[^/]*$/, "") + "graduation-certificate.html?no=" + encodeURIComponent(c.certificate_no);

        const overlay = document.createElement("div");
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(5,10,20,.85);display:flex;align-items:center;justify-content:center;padding:16px;";

        overlay.innerHTML =
            '<div style="max-width:420px;width:100%;background:#101a2e;color:#fff;border:2px solid #22d3a0;border-radius:16px;padding:28px 20px;text-align:center;">' +
            '<div style="font-size:3rem;">&#127891;</div>' +
            '<h2 style="margin:8px 0;">Congratulations, ' + esc(c.name) + '!</h2>' +
            '<p>You have graduated from the Lagos Business Network learning programme. The marketplace is now open to you.</p>' +
            '<p class="meta">Certificate number: <strong>' + esc(c.certificate_no) + '</strong></p>' +
            '<p><a class="contact-btn" id="celCert" href="graduation-certificate.html">See my certificate</a></p>' +
            '<p><button type="button" class="btn btn-outline" id="celShare">Share the news</button></p>' +
            '<p><button type="button" class="btn btn-outline" id="celClose">Close</button></p>' +
            '<p class="meta" id="celMsg"></p>' +
            "</div>";

        document.body.appendChild(overlay);

        let marked = false;

        async function done() {
            if (!marked) {
                marked = true;
                await db.rpc("mark_graduation_celebrated");
            }
        }

        overlay.querySelector("#celClose").addEventListener("click", async function () {
            await done();
            overlay.remove();
        });

        // Going to the certificate also counts as having seen the celebration
        overlay.querySelector("#celCert").addEventListener("click", function () { done(); });

        overlay.querySelector("#celShare").addEventListener("click", async function () {
            const text = "I graduated from Lagos Business Network! Check my certificate: " + verifyLink;
            const note = overlay.querySelector("#celMsg");

            try {
                if (navigator.share) {
                    await navigator.share({ title: "I graduated from Lagos Business Network", text: text, url: verifyLink });
                } else if (navigator.clipboard) {
                    await navigator.clipboard.writeText(text);
                    note.textContent = "Copied. Paste it anywhere you like.";
                } else {
                    note.textContent = verifyLink;
                }
            } catch (e) {
                // The person closed the share sheet: nothing to do
            }
        });
    }

    start();
})();