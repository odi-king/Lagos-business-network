// LBN Phase 9B: the rider page (apply, status, go online, choose areas). Works with supabase-riders.sql.
// Photos go to a private folder that only the rider and LBN finance admins can open.

(function () {
    const logout = document.getElementById("logoutBtn");
    if (logout) {
        logout.addEventListener("click", async function (event) {
            event.preventDefault();
            if (db) await db.auth.signOut();
            window.location.href = "auth.html";
        });
    }

    function el(id) { return document.getElementById(id); }

    let userId = null;
    let zones = [];
    let mine = null;

    function say(box, text, ok) {
        box.textContent = text || "";
        box.className = "msg " + (ok ? "ok" : "error");
    }

    // Shrinks a phone photo so it uploads fast on a weak network (max 1600 px, JPEG)
    function shrink(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = function () {
                const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("Could not read the photo")); }, "image/jpeg", 0.85);
            };

            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("Could not read the photo. Please choose a JPG or PNG picture."));
            };

            img.src = url;
        });
    }

    function newName() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function zoneChecks(container, selected) {
        container.textContent = "";

        zones.forEach(function (z) {
            const label = document.createElement("label");
            label.className = "meta";
            label.style.display = "block";

            const box = document.createElement("input");
            box.type = "checkbox";
            box.value = z.id;
            box.checked = selected.indexOf(z.id) !== -1;

            label.appendChild(box);
            label.appendChild(document.createTextNode(" " + z.name));
            container.appendChild(label);
        });
    }

    function checked(container) {
        return Array.from(container.querySelectorAll("input:checked")).map(function (b) { return b.value; });
    }

    function show() {
        el("statusPanel").style.display = "none";
        el("workPanel").style.display = "none";
        el("applyPanel").style.display = "none";

        const st = mine.status;
        let note = "";

        if (st === "pending") {
            note = "Your application is with the LBN team. You will get a notification when it is checked.";
        } else if (st === "suspended") {
            note = "Your rider account is suspended: " + (mine.reject_reason || "please contact the LBN team.");
        } else if (st === "rejected") {
            note = "The LBN team could not approve your application: " + (mine.reject_reason || "please send it again.");
        } else if (st === "approved" && mine.needs_recheck) {
            note = "You changed your payout account, so the LBN team must check you again. Please send your documents again below.";
        }

        el("riderIntro").textContent = st === "approved" && !mine.needs_recheck
            ? "You are an approved LBN rider."
            : "Earn by delivering items for LBN buyers and sellers inside Lagos.";

        if (note) {
            el("statusText").textContent = note;
            el("statusPanel").style.display = "";
        }

        if (st === "approved" && !mine.needs_recheck) {
            el("workPanel").style.display = "";
            el("onlineText").textContent = mine.available ? "You are online. Customers can be matched with you." : "You are offline. Go online when you are ready to take jobs.";
            el("onlineBtn").textContent = mine.available ? "Go offline" : "Go online";
            zoneChecks(el("zoneBox"), mine.zone_ids || []);
            return;
        }

        if (st === "none" || st === "rejected" || (st === "approved" && mine.needs_recheck)) {
            el("applyPanel").style.display = "";
            el("payoutWarn").style.display = mine.has_payout_account ? "none" : "";
            zoneChecks(el("rZones"), []);
        }
    }

    async function load() {
        const { data, error } = await db.rpc("my_rider");

        if (error || !data) {
            el("riderIntro").textContent = "Rider sign-up is not open yet. (The LBN team still needs to run supabase-riders.sql.)";
            return;
        }

        mine = data;

        if (!zones.length) {
            const z = await db.rpc("delivery_zones_public");
            zones = z.data || [];
        }

        show();
    }

    el("rVehicle").addEventListener("change", function () {
        el("rPlate").style.display = el("rVehicle").value === "bicycle" ? "none" : "";
    });

    el("riderForm").addEventListener("submit", async function (event) {
        event.preventDefault();

        const msg = el("applyMsg");
        const files = [el("rIdPhoto").files[0], el("rSelfie").files[0], el("rVehiclePhoto").files[0]];

        if (!files[0] || !files[1] || !files[2]) { say(msg, "Please choose all three photos.", false); return; }
        if (files.some(function (f) { return !f.type.startsWith("image/"); })) { say(msg, "All three files must be photos.", false); return; }
        if (!checked(el("rZones")).length) { say(msg, "Choose at least one area where you will ride.", false); return; }
        if (!el("rAgree").checked) { say(msg, "Please tick the box to accept the rider rules.", false); return; }

        const button = el("rSubmit");
        button.disabled = true;
        say(msg, "Preparing your photos...", true);

        try {
            const paths = [];

            for (let i = 0; i < files.length; i++) {
                const blob = await shrink(files[i]);
                const path = userId + "/" + newName() + ".jpg";
                say(msg, "Uploading photo " + (i + 1) + " of 3...", true);
                const up = await db.storage.from("rider-docs").upload(path, blob, { contentType: "image/jpeg" });
                if (up.error) throw up.error;
                paths.push(path);
            }

            const { error } = await db.rpc("rider_apply", {
                p_legal_name: el("rName").value,
                p_phone: el("rPhone").value,
                p_vehicle: el("rVehicle").value,
                p_plate: el("rVehicle").value === "bicycle" ? "" : el("rPlate").value,
                p_id_type: el("rIdType").value,
                p_id_path: paths[0],
                p_selfie_path: paths[1],
                p_vehicle_path: paths[2],
                p_zones: checked(el("rZones")),
                p_guarantor_name: el("rGName").value,
                p_guarantor_phone: el("rGPhone").value,
                p_agree: el("rAgree").checked
            });

            if (error) throw error;

            el("riderForm").reset();
            say(msg, "Sent. The LBN team will check your application.", true);
            await load();
        } catch (error) {
            say(msg, error && error.message ? error.message : "Something went wrong. Please try again.", false);
        }

        button.disabled = false;
    });

    el("onlineBtn").addEventListener("click", async function () {
        const { error } = await db.rpc("rider_set_available", { p_on: !mine.available });
        say(el("workMsg"), error ? error.message : "", !error);
        await load();
    });

    el("zoneSave").addEventListener("click", async function () {
        const chosen = checked(el("zoneBox"));
        if (!chosen.length) { say(el("workMsg"), "Choose at least one area.", false); return; }

        const { error } = await db.rpc("rider_set_zones", { p_zones: chosen });
        say(el("workMsg"), error ? error.message : "Your areas are saved.", !error);
        if (!error) await load();
    });

    async function start() {
        if (!db) { el("riderIntro").textContent = "Supabase is not connected yet."; return; }

        const { data } = await db.auth.getSession();

        if (!data.session) { window.location.href = "auth.html"; return; }

        userId = data.session.user.id;
        await load();
    }

    start();
})();