// LBN Phase 6C: the seller's ID check, shown inside the Payout account panel on the dashboard.
// Works with supabase-seller-id.sql. Photos go to a private folder that only the seller and LBN finance admins can open.

(function () {
    const box = document.getElementById("idCheck");
    if (!box || typeof db === "undefined" || !db) return;

    const statusBox = document.getElementById("idStatus");
    const form = document.getElementById("idForm");
    const message = document.getElementById("idMsg");
    let userId = null;

    function say(text, ok) {
        message.textContent = text;
        message.className = "msg " + (ok ? "ok" : "error");
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

    async function load() {
        const { data, error } = await db.rpc("my_seller_verification");

        // The database update has not been run yet: keep this block hidden
        if (error || !data) {
            box.style.display = "none";
            return;
        }

        box.style.display = "";

        let text = "";
        let showForm = false;

        if (!data.has_payout_account) {
            text = "Save your payout account above first. The LBN team matches the name on your ID to your bank account name.";
        } else if (data.status === "pending") {
            text = "Your documents are with the LBN team. You will get a notification when they are checked.";
        } else if (data.status === "approved" && data.can_be_paid) {
            text = "Verified. You can be paid for your completed trades.";
        } else if (data.needs_recheck) {
            text = "You changed your payout account, so the LBN team must check you again before your next payout.";
            showForm = true;
        } else if (data.status === "rejected") {
            text = "The LBN team could not approve your documents: " + (data.reject_reason || "please send them again.");
            showForm = true;
        } else {
            text = "Not verified yet. Before your first payout, the LBN team checks your ID.";
            showForm = true;
        }

        statusBox.textContent = text;
        form.style.display = showForm ? "block" : "none";
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const idFile = document.getElementById("idPhoto").files[0];
        const selfieFile = document.getElementById("idSelfie").files[0];

        if (!idFile || !selfieFile) {
            say("Please choose both photos.", false);
            return;
        }

        if (!idFile.type.startsWith("image/") || !selfieFile.type.startsWith("image/")) {
            say("Both files must be photos.", false);
            return;
        }

        const button = document.getElementById("idSubmit");
        button.disabled = true;
        say("Preparing your photos...", true);

        try {
            const idBlob = await shrink(idFile);
            const selfieBlob = await shrink(selfieFile);

            const idPath = userId + "/" + newName() + ".jpg";
            const selfiePath = userId + "/" + newName() + ".jpg";

            say("Uploading...", true);

            const up1 = await db.storage.from("seller-ids").upload(idPath, idBlob, { contentType: "image/jpeg" });
            if (up1.error) throw up1.error;

            const up2 = await db.storage.from("seller-ids").upload(selfiePath, selfieBlob, { contentType: "image/jpeg" });
            if (up2.error) throw up2.error;

            const { error } = await db.rpc("seller_verification_submit", {
                p_legal_name: document.getElementById("idLegalName").value,
                p_id_type: document.getElementById("idType").value,
                p_id_path: idPath,
                p_selfie_path: selfiePath
            });

            if (error) throw error;

            form.reset();
            say("Sent. The LBN team will check your documents.", true);
            await load();
        } catch (error) {
            say(error && error.message ? error.message : "Something went wrong. Please try again.", false);
        }

        button.disabled = false;
    });

    async function start() {
        const { data } = await db.auth.getSession();
        if (!data.session) return;

        userId = data.session.user.id;
        await load();

        // Saving a different payout account can ask for a new check
        const payoutForm = document.getElementById("payoutForm");
        if (payoutForm) payoutForm.addEventListener("submit", function () { setTimeout(load, 1500); });
    }

    start();
})();