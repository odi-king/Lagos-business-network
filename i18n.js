// Shows the website in the language the member chose.
// It swaps known words and phrases (menus, buttons, headings, statuses, notification titles).
// What members write themselves (posts, comments, names, messages) is never changed.

(function () {
    var LANGS = [
        { code: "en", name: "English" },
        { code: "pcm", name: "Pidgin" },
        { code: "yo", name: "Yorùbá" },
        { code: "ig", name: "Igbo" },
        { code: "ha", name: "Hausa" },
        { code: "fr", name: "Français" }
    ];

    var SKIP = "script, style, textarea, code, pre, [data-no-translate], .post-text, .post-caption, .post-author, " +
        ".comment-text, .chat-msg, .convo-preview, .reply-quote, .tile-text, .reel-caption";

    var ATTRS = ["placeholder", "title", "aria-label"];

    var current = "en";
    var textState = new WeakMap();
    var attrState = new WeakMap();
    var templates = {};

    function known(code) {
        return code === "en" || (typeof LBN_STRINGS !== "undefined" && LBN_STRINGS[code]);
    }

    // Phrases with {n} or {name} become patterns
    function templatesFor(code) {
        if (templates[code]) return templates[code];

        var list = [];
        var dict = LBN_STRINGS[code] || {};

        Object.keys(dict).forEach(function (key) {
            if (key.indexOf("{") === -1) return;

            var names = [];
            var source = key.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{(n|name)\}/g, function (m, token) {
                names.push(token);
                return token === "n" ? "(\\d+)" : "(.+?)";
            });

            list.push({ re: new RegExp("^" + source + "$"), names: names, out: dict[key] });
        });

        templates[code] = list;
        return list;
    }

    function translate(text) {
        if (current === "en" || !LBN_STRINGS[current]) return text;

        var trimmed = text.trim();
        if (!trimmed) return text;

        var hit = LBN_STRINGS[current][trimmed];

        if (hit === undefined) {
            var list = templatesFor(current);

            for (var i = 0; i < list.length; i++) {
                var match = list[i].re.exec(trimmed);
                if (!match) continue;

                var out = list[i].out;
                list[i].names.forEach(function (token, index) {
                    out = out.split("{" + token + "}").join(match[index + 1]);
                });

                hit = out;
                break;
            }
        }

        if (hit === undefined) return text;

        return text.replace(trimmed, function () { return hit; });
    }

    function allowed(node) {
        var parent = node.parentElement;
        return !!parent && !parent.closest(SKIP);
    }

    function processText(node) {
        var state = textState.get(node);
        var value = node.nodeValue;

        // Our own change, or a language switch: translate again from the English
        if (state && value === state.shown) {
            var again = translate(state.orig);

            if (again !== state.shown) {
                state.shown = again;
                node.nodeValue = again;
            }

            return;
        }

        if (!value.trim() || !allowed(node)) return;

        var out = translate(value);
        textState.set(node, { orig: value, shown: out });

        if (out !== value) node.nodeValue = out;
    }

    function processAttrs(el) {
        if (!el.getAttribute || el.closest(SKIP)) return;

        var states = attrState.get(el);
        if (!states) {
            states = {};
            attrState.set(el, states);
        }

        ATTRS.forEach(function (attr) {
            var value = el.getAttribute(attr);
            if (value === null) return;

            var state = states[attr];

            if (state && value === state.shown) {
                var again = translate(state.orig);

                if (again !== state.shown) {
                    state.shown = again;
                    el.setAttribute(attr, again);
                }

                return;
            }

            var out = translate(value);
            states[attr] = { orig: value, shown: out };

            if (out !== value) el.setAttribute(attr, out);
        });
    }

    function applyAll(root) {
        if (!root) return;

        if (root.nodeType === 3) {
            processText(root);
            return;
        }

        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var node;
        var nodes = [];

        while ((node = walker.nextNode())) nodes.push(node);
        nodes.forEach(processText);

        if (root.nodeType === 1) {
            processAttrs(root);
            root.querySelectorAll("[placeholder], [title], [aria-label]").forEach(processAttrs);
        }
    }

    var titleOriginal = null;

    function translateTitle() {
        if (titleOriginal === null) titleOriginal = document.title;

        document.title = titleOriginal.split(" - ").map(function (part) {
            return translate(part);
        }).join(" - ");
    }

    // ---------- Choosing a language ----------

    function renderPickers() {
        document.querySelectorAll("#langSlot").forEach(function (slot) {
            slot.innerHTML = "";

            var label = document.createElement("label");
            label.className = "meta";
            label.setAttribute("for", "langSelect");
            label.textContent = "Language";

            var select = document.createElement("select");
            select.id = "langSelect";
            select.setAttribute("data-no-translate", "");

            LANGS.forEach(function (lang) {
                var option = document.createElement("option");
                option.value = lang.code;
                option.textContent = lang.name;
                select.appendChild(option);
            });

            select.value = current;
            select.addEventListener("change", function () {
                setLanguage(select.value, true);
            });

            slot.appendChild(label);
            slot.appendChild(select);
        });
    }

    function setLanguage(code, save) {
        if (!known(code)) code = "en";

        current = code;
        localStorage.setItem("lbn_lang", code);
        document.documentElement.lang = code;

        var select = document.getElementById("langSelect");
        if (select) select.value = code;

        applyAll(document.body);
        translateTitle();

        if (save && typeof db !== "undefined" && db) {
            db.auth.getSession().then(function (result) {
                if (result.data.session) {
                    db.rpc("set_my_language", { p_lang: code }).then(function () {}, function () {});
                }
            }, function () {});
        }
    }

    // A signed-in member's saved language follows them to every device
    async function syncFromAccount() {
        if (typeof db === "undefined" || !db) return;

        try {
            var sessionResult = await db.auth.getSession();
            var session = sessionResult.data.session;

            if (!session || sessionStorage.getItem("lbn_lang_sync") === session.user.id) return;

            var saved = await db.rpc("my_language");
            if (saved.error) return;

            sessionStorage.setItem("lbn_lang_sync", session.user.id);

            if (saved.data) {
                if (saved.data !== current) setLanguage(saved.data, false);
                return;
            }

            // Never saved yet: use what they picked when they signed up, then remember it
            var meta = session.user.user_metadata || {};
            var chosen = meta.language || localStorage.getItem("lbn_lang") || "en";

            if (known(chosen)) {
                if (chosen !== current) setLanguage(chosen, false);
                db.rpc("set_my_language", { p_lang: chosen }).then(function () {}, function () {});
            }
        } catch (error) {}
    }

    // Anything the page adds later is translated too
    var observer = new MutationObserver(function (mutations) {
        if (current === "en") return;

        mutations.forEach(function (m) {
            if (m.type === "characterData") {
                processText(m.target);
            } else if (m.type === "attributes") {
                processAttrs(m.target);
            } else {
                m.addedNodes.forEach(function (node) { applyAll(node); });
            }
        });
    });

    function start() {
        var saved = localStorage.getItem("lbn_lang");
        if (saved && known(saved)) current = saved;

        document.documentElement.lang = current;

        renderPickers();
        applyAll(document.body);
        translateTitle();

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ATTRS
        });

        syncFromAccount();
    }

    window.LBN_I18N = {
        setLanguage: setLanguage,
        current: function () { return current; },
        t: translate
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();