// LBN Phase 11A: a member adds or corrects their country, state or region and city. Works with supabase-locations.sql.

(function () {
    function el(id) { return document.getElementById(id); }
    function say(t, ok) { const m = el("locMsg"); m.textContent = t || ""; m.className = "msg " + (ok ? "ok" : "error"); }

    const codeOf = window.lbnSetupLocation({ country: "country", state: "stateBox", countryList: "countryList", stateList: "stateList" });

    async function load() {
        const { data: sess } = await db.auth.getSession();
        if (!sess.session) { location.href = "auth.html?next=my-location.html"; return; }

        const { data, error } = await db.rpc("my_location");
        if (error) { say("Locations are not set up yet. (The LBN team still needs to run supabase-locations.sql.)", false); return; }

        if (data) {
            el("country").value = data.country || "";
            el("stateBox").value = data.state || "";
            el("city").value = data.city || "";
            el("orgName").value = data.organisation || "";
            el("country").dispatchEvent(new Event("input"));
        }
    }

    el("locForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        const code = codeOf();
        if (!code) { say("Choose your country from the list.", false); return; }

        const { data, error } = await db.rpc("save_my_location", {
            p_code: code, p_country: el("country").value.trim(), p_state: el("stateBox").value,
            p_city: el("city").value, p_org: el("orgName").value
        });

        if (error || !data || data.ok === false) { say(error ? error.message : (data && data.message) || "Could not save", false); return; }
        say("Saved. Thank you.", true);
    });

    load();
})();