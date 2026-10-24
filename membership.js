// Shared helper: does this user have a paid, unexpired membership?
// Administrators always count as members.
var membershipError = "";

async function hasActiveMembership(userId) {
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