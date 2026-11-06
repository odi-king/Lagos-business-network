// Shared by the admin pages: if this person turned on two-step login, make sure this session passed the code check.

async function requireAal2() {
    try {
        if (typeof db === "undefined" || !db) return true;

        const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel();

        if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
            const page = window.location.pathname.split("/").pop() + window.location.search;
            window.location.href = "auth.html?mfa=1&next=" + encodeURIComponent(page);
            return false;
        }
    } catch (error) {}

    return true;
}