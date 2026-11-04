// Shared helper: does this user have a paid, unexpired membership?
// Administrators always count as members.
var membershipError = "";

// A random id for this phone or computer, used only to stop repeat free trials
function deviceId() {
    let id = localStorage.getItem("lbn_device");

    if (!id) {
        id = window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        localStorage.setItem("lbn_device", id);
    }

    return id;
}

// The first time a new member is seen, ask the server for their free month. It is safe to call again.
var trialResult = "";

async function ensureTrial(userId) {
    const key = "lbn_trial_" + userId;
    const saved = sessionStorage.getItem(key);

    if (saved) {
        trialResult = saved;
        return;
    }

    try {
        const { data, error } = await db.rpc("claim_free_trial", { p_device: deviceId() });

        if (!error && typeof data === "string") {
            trialResult = data;
            // "confirm_email" can change later, so it is not remembered
            if (data !== "confirm_email") sessionStorage.setItem(key, data);
        }
    } catch (error) {}
}

async function getMembershipInfo() {
    try {
        const { data: sessionData } = await db.auth.getSession();
        if (sessionData.session) await ensureTrial(sessionData.session.user.id);

        const { data, error } = await db.rpc("membership_info");
        return !error && data && data[0] ? data[0] : null;
    } catch (error) {
        return null;
    }
}

async function hasActiveMembership(userId) {
    await ensureTrial(userId);

    // Ask the database first: it knows about administrators too
    const answer = await db.rpc("has_active_membership");

    if (!answer.error && typeof answer.data === "boolean") {
        membershipError = "";
        return answer.data;
    }

    const { data, error } = await db
        .from("memberships")
        .select("paid_until")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        membershipError = error.message;
        console.error("Could not check membership:", error.message);
        return false;
    }

    membershipError = "";

    return !!data && new Date(data.paid_until) > new Date();
}

// After Paystack says "paid", ask the server to check with Paystack and record it.
// This does not depend on the webhook, so the person gets their purchase straight away.
async function confirmPayment(reference) {
    try {
        const { data, error } = await db.functions.invoke("paystack-verify", { body: { reference: reference } });

        if (error) return { ok: false, message: error.message };
        if (data && data.error) return { ok: false, message: data.error };

        return { ok: true, message: "" };
    } catch (error) {
        return { ok: false, message: String(error) };
    }
}