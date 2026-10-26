// The live address of your site. Confirmation emails send people back here.
const SITE_URL = "https://odi-king.github.io/Lagos-business-network/";

let mode = "login";

// After logging in, go to the page the person wanted (only pages on this site)
function nextPage() {
    const wanted = new URLSearchParams(window.location.search).get("next");
    if (wanted && /^[a-z0-9_-]+\.html(\?[a-zA-Z0-9=&_%.-]*)?$/i.test(wanted)) {
        return wanted;
    }
    return "dashboard.html";
}

const authTitle = document.getElementById("authTitle");
const authForm = document.getElementById("authForm");
const signupFields = document.getElementById("signupFields");
const fullName = document.getElementById("fullName");
const roleSelect = document.getElementById("role");
const institutionInput = document.getElementById("institution");
const lecturerNote = document.getElementById("lecturerNote");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");
const authMessage = document.getElementById("authMessage");
const toggleText = document.getElementById("toggleText");
const toggleLink = document.getElementById("toggleLink");
const forgotWrap = document.getElementById("forgotWrap");
const forgotLink = document.getElementById("forgotLink");

function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = "msg " + (type || "");
}

// If anything breaks, show the reason on the page instead of failing silently
window.addEventListener("error", function (e) {
    showMessage("Error: " + e.message, "error");
});
window.addEventListener("unhandledrejection", function (e) {
    const reason = e.reason && e.reason.message ? e.reason.message : e.reason;
    showMessage("Error: " + reason, "error");
});

function supabaseReady() {
    let ready = false;
    try {
        ready = !!db;
    } catch (e) {
        ready = false;
    }

    if (!ready) {
        showMessage(
            "Supabase is not connected: " + (typeof dbError !== "undefined" && dbError ? dbError : "check supabase-config.js, then refresh."),
            "error"
        );
        return false;
    }
    return true;
}

// Lecturers must say which school or university they teach at
function syncInstitution() {
    const isLecturer = mode === "signup" && roleSelect.value === "lecturer";
    institutionInput.style.display = isLecturer ? "block" : "none";
    lecturerNote.style.display = isLecturer ? "block" : "none";
    institutionInput.required = isLecturer;
}

roleSelect.addEventListener("change", syncInstitution);

function setMode(newMode) {
    mode = newMode;
    const signup = mode === "signup";
    const forgot = mode === "forgot";

    authTitle.textContent = signup ? "Create your account" : forgot ? "Reset your password" : "Log in";
    submitBtn.textContent = signup ? "Create account" : forgot ? "Send reset link" : "Log in";
    toggleText.textContent = signup ? "Already have an account?" : forgot ? "Remembered it?" : "New here?";
    toggleLink.textContent = signup || forgot ? "Log in" : "Create an account";
    signupFields.style.display = signup ? "flex" : "none";
    fullName.required = signup;

    // The 8-character rule is for new passwords only, so older accounts can still log in
    passwordInput.style.display = forgot ? "none" : "";
    passwordInput.required = !forgot;
    passwordInput.placeholder = signup ? "Password (at least 8 characters)" : "Password";
    if (signup) {
        passwordInput.setAttribute("minlength", "8");
    } else {
        passwordInput.removeAttribute("minlength");
    }
    passwordInput.autocomplete = signup ? "new-password" : "current-password";

    forgotWrap.style.display = mode === "login" ? "block" : "none";
    syncInstitution();
    showMessage("");
}

// The switch between Log in and Create account works even before Supabase is set up
toggleLink.addEventListener("click", function (event) {
    event.preventDefault();
    setMode(mode === "login" ? "signup" : "login");
});

forgotLink.addEventListener("click", function (event) {
    event.preventDefault();
    setMode("forgot");
});

authForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    showMessage("");

    if (!supabaseReady()) return;

    submitBtn.disabled = true;
    showMessage("Please wait...", "ok");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        if (mode === "forgot") {
            const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo: SITE_URL + "reset.html"
            });

            if (error) throw error;

            showMessage("If that email has an account, we have sent a link to reset the password. Check your inbox and spam folder.", "ok");
        } else if (mode === "signup") {
            const { data, error } = await db.auth.signUp({
                email: email,
                password: password,
                options: {
                    emailRedirectTo: SITE_URL + "auth.html",
                    data: {
                        full_name: fullName.value.trim(),
                        role: roleSelect.value,
                        institution: roleSelect.value === "lecturer" ? institutionInput.value.trim() : ""
                    }
                }
            });

            if (error) throw error;

            if (data.session) {
                window.location.href = nextPage();
            } else {
                setMode("login");
                showMessage("Account created. Check your email to confirm it, then log in.", "ok");
            }
        } else {
            const { error } = await db.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;
            window.location.href = nextPage();
        }
    } catch (error) {
        showMessage(error.message, "error");
    } finally {
        submitBtn.disabled = false;
    }
});

// Already logged in? Go straight to the marketplace
if (typeof db !== "undefined" && db) {
    db.auth.getSession().then(function (result) {
        if (result.data.session) {
            window.location.href = nextPage();
        }
    });
}