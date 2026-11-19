// @username suggestions: type @ in a post, caption or comment and pick a member from the list.
// It brings its own styles, so style.css is not touched.

(function () {
    const SELECTOR = "textarea, input.comment-input, input.comment-edit-input, input[data-mentions]";
    const TOKEN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{0,20})$/;

    let menu = null;
    let target = null;
    let items = [];
    let active = 0;
    let timer = null;
    let lastPrefix = null;
    const cache = {};

    const style = document.createElement("style");
    style.textContent =
        ".mention-menu{position:absolute;z-index:500;background:var(--card,#111a2e);border:1px solid var(--line,#1f2a44);border-radius:12px;" +
        "box-shadow:0 8px 24px rgba(0,0,0,.45);min-width:240px;max-width:min(360px,92vw);max-height:260px;overflow-y:auto}" +
        ".mention-item{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-top:1px solid var(--line,#1f2a44)}" +
        ".mention-item:first-child{border-top:none}" +
        ".mention-item.active,.mention-item:hover{background:#0f2b2a}" +
        ".mention-item .m-name{font-weight:700;display:block;line-height:1.2}" +
        ".mention-item .m-handle{font-size:13px;color:var(--muted,#8fa0bc)}" +
        ".mention-empty{padding:10px 12px;color:var(--muted,#8fa0bc);font-size:14px}";
    document.head.appendChild(style);

    function esc(text) {
        return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function closeMenu() {
        if (menu) menu.remove();
        menu = null;
        items = [];
        lastPrefix = null;
    }

    function tokenAt(el) {
        const pos = el.selectionStart;
        if (pos === null || pos === undefined) return null;

        const before = el.value.slice(0, pos);
        const match = TOKEN.exec(before);
        if (!match) return null;

        return { prefix: match[2], start: pos - match[2].length - 1, end: pos };
    }

    function place(el) {
        const r = el.getBoundingClientRect();
        const below = window.innerHeight - r.bottom;
        const top = below > 220 || r.top < 240
            ? r.bottom + window.scrollY + 4
            : r.top + window.scrollY - menu.offsetHeight - 4;

        menu.style.left = Math.max(8, r.left + window.scrollX) + "px";
        menu.style.top = top + "px";
    }

    function avatar(m) {
        return typeof avatarHTML === "function"
            ? avatarHTML(m.full_name, m.avatar_path, "avatar-xs")
            : '<span class="avatar avatar-xs avatar-fallback">' + esc((m.full_name || "?").charAt(0).toUpperCase()) + "</span>";
    }

    function render(el) {
        if (!menu) {
            menu = document.createElement("div");
            menu.className = "mention-menu";
            document.body.appendChild(menu);

            // mousedown, so the box keeps focus and the keyboard stays open on a phone
            menu.addEventListener("mousedown", function (event) {
                event.preventDefault();
                const row = event.target.closest(".mention-item");
                if (row) choose(parseInt(row.dataset.i, 10));
            });
            menu.addEventListener("touchstart", function (event) {
                const row = event.target.closest(".mention-item");
                if (row) {
                    event.preventDefault();
                    choose(parseInt(row.dataset.i, 10));
                }
            }, { passive: false });
        }

        menu.innerHTML = items.length === 0
            ? '<div class="mention-empty">No members found</div>'
            : items.map(function (m, i) {
                return '<div class="mention-item' + (i === active ? " active" : "") + '" data-i="' + i + '">' + avatar(m) +
                    '<span><span class="m-name">' + esc(m.full_name || "Member") + '</span><span class="m-handle">@' + esc(m.username) + "</span></span></div>";
            }).join("");

        place(el);
    }

    function choose(i) {
        const m = items[i];
        if (!m || !target) return;

        const t = tokenAt(target);
        if (!t) {
            closeMenu();
            return;
        }

        const insert = "@" + m.username + " ";
        target.value = target.value.slice(0, t.start) + insert + target.value.slice(t.end);

        const pos = t.start + insert.length;
        target.focus();
        target.setSelectionRange(pos, pos);
        target.dispatchEvent(new Event("input", { bubbles: true }));

        closeMenu();
    }

    async function lookup(el, prefix) {
        let list = cache[prefix];

        if (!list || Date.now() - list.at > 60000) {
            const result = await db.rpc("suggest_usernames", { p_prefix: prefix });
            if (result.error) {
                closeMenu();
                return;
            }
            list = { at: Date.now(), rows: result.data || [] };
            cache[prefix] = list;
        }

        // The person may have typed on or moved away while we waited
        const t = tokenAt(el);
        if (!t || t.prefix !== prefix || target !== el) return;

        items = list.rows;
        active = 0;
        render(el);
    }

    document.addEventListener("input", function (event) {
        const el = event.target;
        if (!el.matches || !el.matches(SELECTOR) || typeof db === "undefined" || !db) return;

        const t = tokenAt(el);

        if (!t) {
            closeMenu();
            return;
        }

        target = el;
        clearTimeout(timer);
        timer = setTimeout(function () { lookup(el, t.prefix); }, 150);
    });

    document.addEventListener("keydown", function (event) {
        if (!menu || items.length === 0) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            active = (active + 1) % items.length;
            render(target);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            active = (active - 1 + items.length) % items.length;
            render(target);
        } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            choose(active);
        } else if (event.key === "Escape") {
            closeMenu();
        }
    });

    document.addEventListener("click", function (event) {
        if (menu && !menu.contains(event.target) && event.target !== target) closeMenu();
    });

    window.addEventListener("scroll", function () { if (menu && target) place(target); }, true);
})();