// The live address of your site. Confirmation emails send people back here.
const SITE_URL = "https://odi-king.github.io/Lagos-business-network/";

let mode = "login";

// A referral link looks like auth.html?ref=ABC12345. Keep the code until this person has signed up.
(function saveReferral() {
    try {
        const code = (new URLSearchParams(window.location.search).get("ref") || "").toUpperCase();
        if (/^[A-Z0-9]{6,12}$/.test(code)) localStorage.setItem("lbn_ref", code);
    } catch (e) {}
})();

function savedReferral() {
    try { return localStorage.getItem("lbn_ref") || ""; } catch (e) { return ""; }
}

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
const usernameInput = document.getElementById("username");
const usernameHint = document.getElementById("usernameHint");
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
    const role = roleSelect.value;
    const needsName = mode === "signup" && (role === "lecturer" || role === "business");

    institutionInput.style.display = needsName ? "block" : "none";
    lecturerNote.style.display = needsName ? "block" : "none";
    institutionInput.required = needsName;
    institutionInput.placeholder = role === "business" ? "Your business or company name" : "Your school or university";
    lecturerNote.textContent = role === "business"
        ? "We check every business before the marketplace opens for it."
        : "We check every lecturer with their school before approving the account.";

    document.querySelectorAll(".role-card").forEach(function (card) {
        const on = card.dataset.role === role;
        card.classList.toggle("selected", on);
        card.setAttribute("aria-pressed", on ? "true" : "false");
    });
}

roleSelect.addEventListener("change", syncInstitution);

document.querySelectorAll(".role-card").forEach(function (card) {
    card.addEventListener("click", function () {
        roleSelect.value = card.dataset.role;
        syncInstitution();
    });
});

function setMode(newMode) {
    mode = newMode;
    const signup = mode === "signup";
    const forgot = mode === "forgot";

    authTitle.textContent = signup ? "Create your account" : forgot ? "Reset your password" : "Log in";
    submitBtn.textContent = signup ? "Create account" : forgot ? "Send reset link" : "Log in";
    toggleText.textContent = signup ? "Already have an account?" : forgot ? "Remembered it?" : "New here?";
    toggleLink.textContent = signup || forgot ? "Log in" : "Create an account";
    signupFields.style.display = signup ? "flex" : "none";
    document.getElementById("termsRow").style.display = signup ? "flex" : "none";
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
            if (!document.getElementById("termsCheck").checked) {
                throw new Error("Please tick the box to agree to the Terms of Use and the Privacy Policy.");
            }

            // The @username must be well formed and free
            const wantedName = usernameInput.value.trim().toLowerCase();

            if (!/^[a-z0-9_]{3,20}$/.test(wantedName)) {
                throw new Error("Choose a username with 3 to 20 letters, numbers or underscores.");
            }

            const nameCheck = await db.rpc("username_available", { p_name: wantedName });

            // If the database file for usernames is not installed yet, signing up still works
            if (!nameCheck.error && nameCheck.data !== true) {
                throw new Error("That username is taken or not allowed. Please choose another.");
            }

            // Where the member is: country must come from the list, city is needed, state is optional (some countries have none)
            const countryName = document.getElementById("country").value.trim();
            const countryHit = (window.LBN_COUNTRIES || []).filter(function (c) { return c[1].toLowerCase() === countryName.toLowerCase(); })[0];
            if (!countryHit) throw new Error("Choose your country from the list.");
            if (!document.getElementById("city").value.trim()) throw new Error("Enter your city or town.");

            const { data, error } = await db.auth.signUp({
                email: email,
                password: password,
                options: {
                    emailRedirectTo: SITE_URL + "auth.html",
                    data: {
                        full_name: fullName.value.trim(),
                        role: roleSelect.value,
                        username: usernameInput.value.trim().toLowerCase(),
                        language: window.LBN_I18N ? LBN_I18N.current() : "en",
                        terms_accepted_at: new Date().toISOString(),
                        referral_code: savedReferral(),
                        country_code: countryHit[0],
                        country: countryHit[1],
                        state: document.getElementById("stateBox").value.trim(),
                        city: document.getElementById("city").value.trim(),
                        organisation: document.getElementById("orgName").value.trim(),
                        institution: (roleSelect.value === "lecturer" || roleSelect.value === "business") ? institutionInput.value.trim() : ""
                    }
                }
            });

            if (error) throw error;

            if (data.session) {
                window.location.href = nextPage();
            } else {
                setMode("login");
                showMessage("Account created. Check your email to confirm it, then log in. Your 30 days of free access are counted from today.", "ok");
            }
        } else {
            const { error } = await db.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            if (await needsMfa()) {
                await showMfaStep();
                return;
            }

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
    db.auth.getSession().then(async function (result) {
        if (result.data.session) {
            if (await needsMfa()) {
                await showMfaStep();
                return;
            }

            window.location.href = nextPage();
        }
    });
}


// ---------- Two-step login ----------

let mfaFactorId = null;

async function needsMfa() {
    try {
        const { data } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
        return !!data && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
    } catch (error) {
        return false;
    }
}

async function showMfaStep() {
    const factors = await db.auth.mfa.listFactors();
    const totp = factors.data && factors.data.totp && factors.data.totp[0];

    if (!totp) {
        window.location.href = nextPage();
        return;
    }

    mfaFactorId = totp.id;
    authForm.style.display = "none";
    toggleText.parentElement.style.display = "none";
    document.getElementById("mfaBox").style.display = "block";
    document.getElementById("mfaCode").focus();
}

document.getElementById("mfaForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const code = document.getElementById("mfaCode").value.trim();
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: code });

    if (error) {
        showMessage("That code is not right. Check the code in your app and try again.", "error");
        return;
    }

    window.location.href = nextPage();
});

document.getElementById("mfaCancel").addEventListener("click", async function () {
    await db.auth.signOut();
    window.location.href = "auth.html";
});


// ---------- Choosing a username ----------

let usernameTimer = null;
let usernameTouched = false;

function showUsernameHint(text, type) {
    usernameHint.textContent = text;
    usernameHint.className = "msg " + (type || "");
}

function usernameFromName(name) {
    const slug = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 14);
    return slug.length >= 3 ? slug : "";
}

async function checkUsername() {
    const value = usernameInput.value.trim().toLowerCase();

    if (!value) {
        showUsernameHint("");
        return;
    }

    if (!/^[a-z0-9_]{3,20}$/.test(value)) {
        showUsernameHint("Use 3 to 20 letters, numbers or underscores (_).", "error");
        return;
    }

    const { data, error } = await db.rpc("username_available", { p_name: value });

    if (error) {
        showUsernameHint("");
        return;
    }

    showUsernameHint(data === true ? "@" + value + " is available" : "@" + value + " is taken or not allowed. Try " + value + "1", data === true ? "ok" : "error");
}

usernameInput.addEventListener("input", function () {
    usernameTouched = true;

    // Only letters, numbers and underscores, always lowercase
    const clean = usernameInput.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean !== usernameInput.value) usernameInput.value = clean;

    clearTimeout(usernameTimer);
    usernameTimer = setTimeout(checkUsername, 400);
});

// A first suggestion made from the name, until the person types their own
fullName.addEventListener("input", function () {
    if (usernameTouched) return;

    usernameInput.value = usernameFromName(fullName.value);
    clearTimeout(usernameTimer);
    usernameTimer = setTimeout(checkUsername, 400);
});

// "You were invited by Daniel" on the sign up page
(async function showInviter() {
    const code = savedReferral();
    if (!code || typeof db === "undefined" || !db) return;

    try {
        const { data } = await db.rpc("referral_inviter", { p_code: code });
        if (data && typeof data === "string") {
            const note = document.createElement("p");
            note.className = "notice";
            note.textContent = data + " invited you. Sign up to get your first month free.";
            authForm.parentNode.insertBefore(note, authForm);
        }
    } catch (e) {}
})();

// Searchable country list and Nigerian states on the sign up form
if (typeof window.lbnSetupLocation === "function" && document.getElementById("country")) {
    window.lbnSetupLocation({ country: "country", state: "stateBox", countryList: "countryList", stateList: "stateList" });
}