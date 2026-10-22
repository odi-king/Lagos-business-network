// Shared helper: does this user have a paid, unexpired membership?
var membershipError = "";

async function hasActiveMembership(userId) {
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