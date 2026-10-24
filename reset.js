// Works two ways: from the link in a "reset password" email,
// or for a logged-in member who wants to change their password.

const resetForm = document.getElementById("resetForm");
const newPassword = document.getElementById("newPassword");
const confirmPassword = document.getElementById("confirmPassword");
const saveBtn = document.getElementById("saveBtn");
const resetMessage = document.getElementById("resetMessage");

let ready = false;

function showMessage(text, type) {
    resetMessage.textContent = text;
    resetMessage.className = "msg " + (type || "");
}

function enableForm() {
    if (ready) return;
    ready = true;
    saveBtn.disabled = false;
    showMessage("");
}

function init() {
    saveBtn.disabled = true;

    if (typeof db === "undefined" || !db) {
        showMessage("Supabase is not connected yet. Check supabase-config.js.", "error");
        return;
    }

    // A reset link signs the person in for a moment; wait for Supabase to read it
    db.auth.onAuthStateChange(function (event, session) {
        if (event === "PASSWORD_RECOVERY" || session) {
            enableForm();
        }
    });

    db.auth.getSession().then(function (result) {
        if (result.data.session) {
            enableForm();
        }
    });

    setTimeout(function () {
        if (!ready) {
            showMessage("This link is not valid or has expired. Go back to log in and ask for a new reset link.", "error");
        }
    }, 3000);
}

resetForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!ready) return;

    if (newPassword.value.length < 8) {
        showMessage("Use at least 8 characters.", "error");
        return;
    }

    if (newPassword.value !== confirmPassword.value) {
        showMessage("The two passwords do not match.", "error");
        return;
    }

    saveBtn.disabled = true;
    showMessage("Please wait...", "ok");

    const { error } = await db.auth.updateUser({ password: newPassword.value });

    if (error) {
        showMessage(error.message, "error");
        saveBtn.disabled = false;
        return;
    }

    showMessage("Password changed. Taking you to your dashboard...", "ok");

    setTimeout(function () {
        window.location.href = "dashboard.html";
    }, 1500);
});

init();