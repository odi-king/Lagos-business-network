// Supabase configuration for Lagos Business Network
const SUPABASE_URL = "https://ubtcjvyjdknyeswceplf.supabase.co";
const SUPABASE_KEY = "sb_publishable_xmm0o-ocSHXI_w2RixFbfg_q2_sdw70";

// If the connection fails, db stays null and dbError explains why
var db = null;
var dbError = "";

try {
    if (typeof window.supabase === "undefined") {
        dbError = "The Supabase library did not load. Check your internet connection.";
    } else if (
        SUPABASE_URL.indexOf("PASTE") === 0 ||
        SUPABASE_KEY.indexOf("PASTE") === 0
    ) {
        dbError = "The Project URL or key in supabase-config.js has not been pasted yet.";
    } else if (
        !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim())
    ) {
        dbError = "The Project URL should look like https://abcdxyz.supabase.co.";
    } else {
        db = window.supabase.createClient(
            SUPABASE_URL.trim(),
            SUPABASE_KEY.trim()
        );
    }
} catch (error) {
    dbError = error.message;
}

if (!db) {
    console.error("Supabase is not connected:", dbError);
}
