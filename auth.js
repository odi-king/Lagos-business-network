let mode = "login";

const authTitle = document.getElementById("authTitle");
const authForm = document.getElementById("authForm");
const signupFields = document.getElementById("signupFields");
const fullName = document.getElementById("fullName");
const roleSelect = document.getElementById("role");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");
const authMessage = document.getElementById("authMessage");
const toggleText = document.getElementById("toggleText");
const toggleLink = document.getElementById("toggleLink");

function showMessage(text, type) {
    authMessage.textContent = text;
    authMessage.className = "msg " + (type || "");
}

window.addEventListener("error", function (event) {
    showMessage("Error: " + event.message, "error");
});

window.addEventListener("unhandledrejection", function (event) {
    const reason = event.reason && event.reason.message
        ? event.reason.message
        : String(event.reason || "Unknown error");

    showMessage("Error: " + reason, "error");
});

function supabaseReady() {
    if (typeof db === "undefined" || !db) {
        const reason = typeof dbError !== "undefined" && dbError
            ? dbError
            : "Check supabase-config.js and refresh the page.";

        showMessage("Supabase is not connected: " + reason, "error");
        return false;
    }

    return true;
}

function setMode(newMode) {
    mode = newMode;
    const signup = mode === "signup";

    authTitle.textContent = signup ? "Create your account" : "Log in";
    submitBtn.textContent = signup ? "Create account" : "Log in";
    toggleText.textContent = signup
        ? "Already have an account?"
        : "New here?";
    toggleLink.textContent = signup ? "Log in" : "Create an account";

    signupFields.style.display = signup ? "flex" : "none";
    fullName.required = signup;

    showMessage("");
}

toggleLink.addEventListener("click", function (event) {
    event.preventDefault();
    setMode(mode === "login" ? "signup" : "login");
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
        if (mode === "signup") {
            const { data, error } = await db.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName.value.trim(),
                        role: roleSelect.value
                    }
                }
            });

            if (error) throw error;

            if (data.session) {
                window.location.href = "dashboard.html";
            } else {
                setMode("login");
                showMessage(
                    "Account created. Check your email to confirm it, then log in.",
                    "ok"
                );
            }
        } else {
            const { error } = await db.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            window.location.href = "dashboard.html";
        }
    } catch (error) {
        showMessage(
            error.message || "Something went wrong. Please try again.",
            "error"
        );
    } finally {
        submitBtn.disabled = false;
    }
});

async function checkExistingSession() {
    if (!supabaseReady()) return;

    try {
        const { data, error } = await db.auth.getSession();

        if (error) throw error;

        if (data.session) {
            window.location.href = "dashboard.html";
        }
    } catch (error) {
        showMessage(
            "Could not check your login: " + error.message,
            "error"
        );
    }
}

setMode("login");
checkExistingSession();
