let me = null;
let myEmail = "";

function esc(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function say(id, text, ok) {
    const box = document.getElementById(id);
    box.textContent = text;
    box.className = "msg " + (ok ? "ok" : "error");
}

function friendly(error) {
    const message = (error && error.message) || String(error);

    if (/could not find the function|schema cache/i.test(message)) {
        return "The Privacy Centre needs its database update. Run supabase-privacy.sql in Supabase.";
    }

    return message;
}

async function init() {
    const note = document.getElementById("pageNote");

    if (!db) {
        note.textContent = "Supabase is not connected yet. Check supabase-config.js.";
        return;
    }

    const session = (await db.auth.getSession()).data.session;

    if (!session) {
        window.location.href = "auth.html?next=account.html";
        return;
    }

    me = session.user;
    myEmail = me.email || "";

    document.getElementById("loginEmail").textContent = myEmail;
    document.getElementById("lastSignIn").textContent = me.last_sign_in_at ? new Date(me.last_sign_in_at).toLocaleString() : "Now";

    await Promise.all([loadInfo(), loadSettings(), loadBlocked(), loadBlockers(), loadState()]);

    note.style.display = "none";
    document.getElementById("body").style.display = "block";
}

// ---------- Personal information ----------

async function loadInfo() {
    const profile = await db.from("profiles").select("full_name, bio").eq("id", me.id).maybeSingle();

    if (profile.data) {
        document.getElementById("fullName").value = profile.data.full_name || "";
        document.getElementById("bio").value = profile.data.bio || "";
    }

    const priv = await db.rpc("my_private");

    if (priv.data && priv.data[0]) {
        document.getElementById("phone").value = priv.data[0].phone || "";
        document.getElementById("contactEmail").value = priv.data[0].contact_email || "";
    }
}

document.getElementById("infoForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const first = await db.rpc("update_my_profile", {
        p_name: document.getElementById("fullName").value,
        p_bio: document.getElementById("bio").value
    });

    if (first.error) {
        say("infoMsg", friendly(first.error), false);
        return;
    }

    const second = await db.rpc("save_my_private", {
        p_phone: document.getElementById("phone").value,
        p_email: document.getElementById("contactEmail").value
    });

    if (second.error) {
        say("infoMsg", friendly(second.error), false);
        return;
    }

    say("infoMsg", "Saved.", true);
});

// ---------- Password and sessions ----------

document.getElementById("passwordForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const current = document.getElementById("currentPassword").value;
    const next = document.getElementById("newPassword").value;
    const again = document.getElementById("newPassword2").value;

    if (next.length < 8) {
        say("passwordMsg", "The new password must have at least 8 characters.", false);
        return;
    }

    if (next !== again) {
        say("passwordMsg", "The two new passwords are not the same.", false);
        return;
    }

    if (next === current) {
        say("passwordMsg", "Choose a password that is different from your current one.", false);
        return;
    }

    // Prove it is really you before changing anything
    const check = await db.auth.signInWithPassword({ email: myEmail, password: current });

    if (check.error) {
        say("passwordMsg", "Your current password is not correct.", false);
        return;
    }

    const { error } = await db.auth.updateUser({ password: next });

    if (error) {
        say("passwordMsg", error.message, false);
        return;
    }

    event.target.reset();
    say("passwordMsg", "Your password was changed. Your other devices will be asked to log in again.", true);

    db.auth.signOut({ scope: "others" }).then(function () {}, function () {});
});

document.getElementById("signOutOthers").addEventListener("click", async function () {
    const { error } = await db.auth.signOut({ scope: "others" });
    say("securityMsg", error ? error.message : "Signed out of your other devices.", !error);
});

document.getElementById("signOutAll").addEventListener("click", async function () {
    if (!confirm("Sign out of every device, including this one?")) return;

    await db.auth.signOut({ scope: "global" });
    window.location.href = "auth.html";
});

// ---------- Privacy and notifications ----------

async function loadSettings() {
    const { data, error } = await db.rpc("my_settings");

    if (error || !data) {
        say("privacyMsg", friendly(error || "Could not load your settings."), false);
        return;
    }

    document.getElementById("setProfile").value = data.profile_visibility;
    document.getElementById("setMessage").value = data.message_permission;
    document.getElementById("setContact").value = data.contact_visibility;
    document.getElementById("setTag").value = data.tag_permission;
    document.getElementById("setComment").value = data.comment_permission;
    document.getElementById("setDiscoverable").checked = !!data.discoverable;

    document.getElementById("nFollows").checked = !!data.notify_follows;
    document.getElementById("nLikes").checked = !!data.notify_likes;
    document.getElementById("nComments").checked = !!data.notify_comments;
    document.getElementById("nMessages").checked = !!data.notify_messages;
    document.getElementById("nTrades").checked = !!data.notify_trades;
}

document.getElementById("savePrivacy").addEventListener("click", async function () {
    const { error } = await db.rpc("save_my_settings", {
        p_settings: {
            profile_visibility: document.getElementById("setProfile").value,
            message_permission: document.getElementById("setMessage").value,
            contact_visibility: document.getElementById("setContact").value,
            tag_permission: document.getElementById("setTag").value,
            comment_permission: document.getElementById("setComment").value,
            discoverable: document.getElementById("setDiscoverable").checked
        }
    });

    say("privacyMsg", error ? friendly(error) : "Your privacy settings were saved.", !error);
});

document.getElementById("saveNotify").addEventListener("click", async function () {
    const { error } = await db.rpc("save_my_settings", {
        p_settings: {
            notify_follows: document.getElementById("nFollows").checked,
            notify_likes: document.getElementById("nLikes").checked,
            notify_comments: document.getElementById("nComments").checked,
            notify_messages: document.getElementById("nMessages").checked,
            notify_trades: document.getElementById("nTrades").checked
        }
    });

    say("notifyMsg", error ? friendly(error) : "Your notification settings were saved.", !error);
});

// ---------- Blocked accounts ----------

async function loadBlocked() {
    const list = document.getElementById("blockedList");
    const { data, error } = await db.rpc("my_blocked");

    if (error) {
        list.innerHTML = "<p class='meta'>" + esc(friendly(error)) + "</p>";
        return;
    }

    list.innerHTML = data.length === 0
        ? "<p class='meta'>You have not blocked anyone.</p>"
        : data.map(function (b) {
            return '<div class="member-row"><strong>' + esc(b.full_name || "Member") + "</strong>" +
                '<button type="button" class="btn btn-outline unblock-btn" data-id="' + esc(b.user_id) + '">Unblock</button></div>';
        }).join("");
}

document.getElementById("blockedList").addEventListener("click", async function (event) {
    const button = event.target.closest(".unblock-btn");
    if (!button) return;

    const { error } = await db.rpc("unblock_user", { p_user: button.dataset.id });

    if (error) {
        alert(friendly(error));
        return;
    }

    await loadBlocked();
});

let blockTimer = null;

document.getElementById("blockSearch").addEventListener("input", function (event) {
    clearTimeout(blockTimer);

    blockTimer = setTimeout(async function () {
        const text = event.target.value.trim();
        const results = document.getElementById("blockResults");

        if (text.length < 2) {
            results.innerHTML = "";
            return;
        }

        const { data, error } = await db.rpc("find_members", { p_search: text, p_role: null });

        if (error) {
            results.innerHTML = "<p class='meta'>" + esc(friendly(error)) + "</p>";
            return;
        }

        const others = data.filter(function (m) { return m.id !== me.id; });

        results.innerHTML = others.length === 0
            ? "<p class='meta'>No members found.</p>"
            : others.map(function (m) {
                return '<div class="member-row"><strong>' + esc(m.full_name || "Member") + "</strong>" +
                    '<button type="button" class="btn btn-outline block-btn" data-id="' + esc(m.id) + '" data-name="' + esc(m.full_name || "this member") + '">Block</button></div>';
            }).join("");
    }, 300);
});

document.getElementById("blockResults").addEventListener("click", async function (event) {
    const button = event.target.closest(".block-btn");
    if (!button) return;

    if (!confirm("Block " + button.dataset.name + "? They will not be able to message, follow, tag or comment on you.")) return;

    const { error } = await db.rpc("block_user", { p_user: button.dataset.id });

    if (error) {
        alert(friendly(error));
        return;
    }

    document.getElementById("blockResults").innerHTML = "";
    document.getElementById("blockSearch").value = "";
    await loadBlocked();
});

// ---------- Download my data ----------

document.getElementById("exportBtn").addEventListener("click", async function () {
    const button = this;
    button.disabled = true;
    say("exportMsg", "Preparing your data...", true);

    const { data, error } = await db.rpc("export_my_data");

    button.disabled = false;

    if (error) {
        say("exportMsg", friendly(error), false);
        return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lbn-my-data-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();

    say("exportMsg", "Your data was downloaded.", true);
});

// ---------- Deactivate and delete ----------

async function loadState() {
    const { data } = await db.rpc("my_account_state");
    document.getElementById("deactivatedBox").style.display = data === "deactivated" ? "block" : "none";
}

async function loadBlockers() {
    const { data } = await db.rpc("account_blockers");
    const box = document.getElementById("blockers");

    box.innerHTML = data && data.length > 0
        ? '<div class="notice">You cannot delete or deactivate your account yet:<ul>' + data.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul></div>"
        : "";
}

document.getElementById("reactivateBtn").addEventListener("click", async function () {
    const { error } = await db.rpc("reactivate_my_account");

    if (error) {
        alert(friendly(error));
        return;
    }

    await loadState();
    if (window.location) window.location.reload();
});

document.getElementById("deactivateBtn").addEventListener("click", async function () {
    if (!confirm("Deactivate your account? Your profile and posts will be hidden until you reactivate.")) return;

    const { error } = await db.rpc("deactivate_my_account");

    if (error) {
        say("deactivateMsg", friendly(error), false);
        return;
    }

    say("deactivateMsg", "Your account is deactivated.", true);
    await loadState();
});

document.getElementById("deleteBtn").addEventListener("click", async function () {
    const password = document.getElementById("deletePassword").value;
    const confirmText = document.getElementById("deleteConfirm").value.trim();

    if (!password) {
        say("deleteMsg", "Enter your password.", false);
        return;
    }

    if (confirmText !== "DELETE") {
        say("deleteMsg", "Type DELETE (in capital letters) to confirm.", false);
        return;
    }

    if (!confirm("This permanently deletes your account. It cannot be undone. Continue?")) return;

    const button = this;
    button.disabled = true;
    say("deleteMsg", "Deleting your account...", true);

    const { data, error } = await db.functions.invoke("delete-account", { body: { password: password, confirm: confirmText } });

    if (error || (data && data.error)) {
        let message = data && data.error ? data.error : "Could not delete the account.";

        if (error && error.context && typeof error.context.json === "function") {
            try { message = (await error.context.json()).error || message; } catch (e) {}
        }

        button.disabled = false;
        say("deleteMsg", message, false);
        return;
    }

    await db.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";
});

document.getElementById("logoutBtn").addEventListener("click", async function (event) {
    event.preventDefault();
    if (db) await db.auth.signOut();
    window.location.href = "auth.html";
});

init();