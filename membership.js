
async function hasActiveMembership(userId) {
    const { data, error } = await db
        .from("memberships")
        .select("paid_until")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error("Could not check membership:", error.message);
        return false;
    }

    return Boolean(
        data &&
        data.paid_until &&
        new Date(data.paid_until) > new Date()
    );
}
