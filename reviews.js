// Star ratings, shared by profiles, trades and post cards.

function starText(value) {
    const full = Math.round(Number(value) || 0);
    return "\u2605".repeat(full) + "\u2606".repeat(5 - full);
}

function ratingLine(avg, count) {
    if (!count) return "No reviews yet";
    return "\u2605 " + Number(avg).toFixed(1) + " (" + count + (count === 1 ? " review)" : " reviews)");
}