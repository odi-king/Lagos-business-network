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

function supabaseReady() {
    if (!db) {
        showMessage(
            "Supabase is not connected yet. Paste your Project URL and anon key into supabase-config.js, make sure you are online, then refresh.",
            "error"
        );
        return false;
    }
    return true;
}

function setMode(newMode) {
    mode = newMode;
    const signup = mode === "signup";

    authTitle.textContent = signup ? "Create your account" : "Log in";
    submitBtn.textContent = signup ? "Create account" : "Log in";
    toggleText.textContent = signup ? "Already have an account?" : "New here?";
    toggleLink.textContent = signup ? "Log in" : "Create an account";
    signupFields.style.display = signup ? "flex" : "none";
    fullName.required = signup;
    showMessage("");
}

// The switch between Log in and Create account works even before Supabase is set up
toggleLink.addEventListener("click", function (event) {
    event.preventDefault();
    setMode(mode === "login" ? "signup" : "login");
});

authForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    showMessage("");

    if (!supabaseReady()) return;

    submitBtn.disabled = true;

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
                showMessage("Account created. Check your email to confirm it, then log in.", "ok");
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
        showMessage(error.message, "error");
    } finally {
        submitBtn.disabled = false;
    }
});

// Already logged in? Go straight to the marketplace
if (db) {
    db.auth.getSession().then(function (result) {
        if (result.data.session) {
            window.location.href = "dashboard.html";
        }
    });
}