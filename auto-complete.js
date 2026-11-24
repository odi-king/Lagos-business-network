// LBN Phase 6B: tells both people when a delivered trade will complete by itself.
// Works together with trade.js (it uses trade, me, tradeId, refresh, isParticipant)
// and with supabase-auto-complete.sql.

let autoLastText = "";

function autoDateText(value) {
    return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function loadAutoNote() {
    const note = document.getElementById("autoNote");

    if (!note || !trade || !me || !isParticipant() || document.hidden) return;

    if (trade.status !== "delivered") {
        note.style.display = "none";
        autoLastText = "";
        return;
    }

    const result = await db.rpc("trade_auto_status", { p_trade_id: tradeId });

    // The database update has not been run yet: say nothing
    if (result.error || !result.data) {
        note.style.display = "none";
        return;
    }

    const s = result.data;

    // The page just completed the trade for us (the job was late): show the new state
    if (s.status !== "delivered") {
        note.style.display = "none";
        await refresh();
        return;
    }

    const isBuyer = trade.buyer_id === me.id;
    let text = "";

    if (s.paused) {
        text = "The automatic completion is paused while the return is open.";
    } else if (s.auto_complete_at) {
        const when = autoDateText(s.auto_complete_at);

        if (isBuyer) {
            text = (s.warned ? "Reminder: " : "") +
                "If you do nothing, this trade completes automatically on " + when + ". " +
                "Check your order. Confirm if you are happy. If something is wrong, ask for a return or open a dispute before then and the money stays on hold.";
        } else {
            text = (s.warned ? "Reminder: " : "") +
                "If the buyer does not respond, this trade completes automatically on " + when + "." +
                (s.paid ? " Your payment is then released." : "");
        }
    }

    if (text === autoLastText) return;

    autoLastText = text;
    note.textContent = text;
    note.style.display = text ? "" : "none";
}

// Check once the trade is loaded, then every 30 seconds while the page is open
(function () {
    let tries = 0;

    const first = setInterval(function () {
        tries++;

        if (trade) {
            clearInterval(first);
            loadAutoNote();
        } else if (tries > 20) {
            clearInterval(first);
        }
    }, 500);

    setInterval(loadAutoNote, 30000);

    // The trade changed (for example it was delivered a moment ago): check again soon
    document.addEventListener("visibilitychange", function () {
        if (!document.hidden) loadAutoNote();
    });
})();