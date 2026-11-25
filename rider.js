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

    // ---------- Jobs (Phase 9C) ----------
    let jobTimer = null;
    let jobBusy = false;
    let jobSig = "";

    function naira(n) { return "₦" + Number(n || 0).toLocaleString("en-NG"); }

    function line(parent, text, cls) {
        const p = document.createElement("p");
        p.className = cls || "meta";
        p.textContent = text;
        parent.appendChild(p);
        return p;
    }

    function jobButton(label, cls, fn) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.addEventListener("click", fn);
        return b;
    }

    async function accept(id) {
        const { data, error } = await db.rpc("rider_accept_delivery", { p_id: id });
        say(el("openMsg"), error ? error.message : (data && data.ok ? "Job accepted. See it under Your jobs." : (data && data.message) || "Could not accept"), !error && data && data.ok);
        jobSig = "";
        loadJobs();
    }

    async function release(id) {
        if (!confirm("Give this job back? Another rider will be found.")) return;
        const { data, error } = await db.rpc("rider_release_delivery", { p_id: id });
        say(el("activeMsg"), error ? error.message : (data && data.ok ? "Job given back." : (data && data.message) || "Could not give it back"), !error && data && data.ok);
        jobSig = "";
        loadJobs();
    }

    async function sendPin(job, input) {
        const fn = job.status === "assigned" ? "rider_confirm_pickup" : "rider_confirm_delivery";
        const pin = input.value.trim();
        if (!/^\d{4}$/.test(pin)) { say(el("activeMsg"), "The PIN is 4 numbers.", false); return; }

        const { data, error } = await db.rpc(fn, { p_id: job.id, p_pin: pin });
        const good = !error && data && data.ok;
        let text = error ? error.message : (data && data.message) || "";

        if (good) text = job.status === "assigned" ? "Pickup confirmed. The buyer's address is now shown." : "Delivered. " + naira(data.earned) + " added to your earnings.";

        say(el("activeMsg"), text, good);
        jobSig = "";
        loadJobs();
    }

    function drawActive(jobs) {
        const box = el("activeList");
        box.textContent = "";

        const live = jobs.filter(function (j) { return j.status !== "delivered"; });
        const done = jobs.filter(function (j) { return j.status === "delivered"; }).slice(0, 5);

        if (!live.length) line(box, "No active jobs. Accept one below.");

        live.forEach(function (j) {
            const card = document.createElement("div");
            card.className = "panel";
            card.style.margin = "8px 0";

            line(card, j.item + " • you earn " + naira(j.earn), "").style.fontWeight = "700";
            line(card, j.pickup_zone + " → " + j.drop_zone);

            if (j.status === "assigned") {
                line(card, "1. Collect from: " + (j.pickup_address || "") + (j.pickup_phone ? " • " + j.pickup_phone : ""), "");
                line(card, "The seller reads you the pickup PIN when you collect the item.");
            } else {
                line(card, "2. Deliver to: " + (j.drop_address || "") + (j.drop_phone ? " • " + j.drop_phone : ""), "");
                if (j.drop_note) line(card, "Note: " + j.drop_note);
                line(card, "The buyer reads you the delivery PIN when the item is in their hands.");
            }

            if (j.locked) {
                line(card, "Too many wrong tries. Wait a few minutes.", "notice");
            } else {
                const input = document.createElement("input");
                input.type = "text";
                input.inputMode = "numeric";
                input.maxLength = 4;
                input.placeholder = j.status === "assigned" ? "Pickup PIN" : "Delivery PIN";
                card.appendChild(input);
                card.appendChild(jobButton(j.status === "assigned" ? "Confirm pickup" : "Confirm delivery", "contact-btn", function () { sendPin(j, input); }));
            }

            if (j.status === "assigned") card.appendChild(jobButton("Give this job back", "btn btn-outline", function () { release(j.id); }));

            box.appendChild(card);
        });

        if (done.length) {
            line(box, "Recently delivered", "").style.fontWeight = "700";
            done.forEach(function (j) { line(box, j.item + " • " + naira(j.earn) + (j.paid ? " • paid" : " • waiting for payment")); });
        }
    }

    function drawOpen(rows) {
        const box = el("openList");
        box.textContent = "";

        if (!rows.length) { line(box, "No open jobs in your areas right now. This page refreshes by itself."); return; }

        rows.forEach(function (r) {
            const card = document.createElement("div");
            card.className = "panel";
            card.style.margin = "8px 0";
            line(card, r.item + " • you earn " + naira(r.earn), "").style.fontWeight = "700";
            line(card, "Collect in " + r.pickup_zone + " → deliver in " + r.drop_zone);
            card.appendChild(jobButton("Accept this job", "contact-btn", function () { accept(r.id); }));
            box.appendChild(card);
        });
    }

    async function loadJobs() {
        if (jobBusy || !mine || mine.status !== "approved" || mine.needs_recheck) return;
        jobBusy = true;

        try {
            const [mineRes, openRes, earnRes] = await Promise.all([
                db.rpc("my_rider_jobs"),
                mine.available ? db.rpc("rider_open_jobs") : Promise.resolve({ data: [] }),
                db.rpc("rider_earnings")
            ]);

            if (mineRes.error || earnRes.error) {
                say(el("activeMsg"), "Jobs are not set up yet. (The LBN team still needs to run supabase-rider-jobs.sql.)", false);
                return;
            }

            const jobs = mineRes.data || [];
            const open = openRes.data || [];
            const earn = earnRes.data || {};

            const sig = JSON.stringify([jobs, open, earn, mine.available]);
            if (sig === jobSig) return;
            jobSig = sig;

            el("earnText").textContent = "Waiting to be paid: " + naira(earn.owed) + " • Already paid: " + naira(earn.paid) + " • Deliveries done: " + (earn.jobs_done || 0) +
                (earn.can_be_paid ? "" : " • Your payout account needs checking before LBN can pay you.");

            drawActive(jobs);

            el("openPanel").style.display = "";
            if (mine.available) drawOpen(open);
            else { el("openList").textContent = ""; line(el("openList"), "Go online to see open jobs."); }
        } finally {
            jobBusy = false;
        }
    }

    function startJobs() {
        clearInterval(jobTimer);
        jobTimer = setInterval(function () { if (!document.hidden) loadJobs(); }, 5000);
        jobSig = "";
        loadJobs();
    }

    function stopJobs() {
        clearInterval(jobTimer);
        jobTimer = null;
        el("earnPanel").style.display = "none";
        el("activePanel").style.display = "none";
        el("openPanel").style.display = "none";
    }

    function show() {
        el("statusPanel").style.display = "none";
        el("workPanel").style.display = "none";
        stopJobs();
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
            el("earnPanel").style.display = "";
            el("activePanel").style.display = "";
            startJobs();
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