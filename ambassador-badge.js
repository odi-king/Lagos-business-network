// Shows an "Ambassador" badge next to the names of confirmed LBN ambassadors (posts, comments and profiles).
// It asks the database for the badges of the people on screen in one batch, and remembers the answers.
(function () {
    if (typeof db === "undefined" || !db) return;

    const LABEL = { business: "Business Ambassador", student: "Student Ambassador", lecturer: "Lecturer Ambassador" };
    const known = {}; // id -> type, or "" for "not an ambassador"
    let timer = null;

    const style = document.createElement("style");
    style.textContent = ".vbadge.ambassador{color:#ff8a5b;background:#2b1710;border-color:#6b3420;}";
    document.head.appendChild(style);

    function idFromLink(link) {
        const m = /member\.html\?id=([0-9a-f-]{36})/i.exec(link.getAttribute("href") || "");
        return m ? m[1] : null;
    }

    function chip(type) {
        const span = document.createElement("span");
        span.className = "vbadge ambassador";
        span.setAttribute("data-amb", "1");
        span.title = LABEL[type];
        span.textContent = "★ " + LABEL[type];
        return span;
    }

    function targets() {
        const list = [];

        document.querySelectorAll("a.post-author").forEach(function (link) {
            const id = idFromLink(link);
            if (id) list.push({ id: id, node: link });
        });

        document.querySelectorAll("h1.profile-name[data-uid]").forEach(function (h) {
            list.push({ id: h.getAttribute("data-uid"), node: h.lastChild || h, inside: h });
        });

        return list.filter(function (t) {
            const host = t.inside || t.node.parentNode;
            return host && !t.node.hasAttribute?.("data-amb-done") && !(t.inside && t.inside.hasAttribute("data-amb-done"));
        });
    }

    function paint() {
        targets().forEach(function (t) {
            const type = known[t.id];
            if (!type) return;

            if (t.inside) {
                t.inside.setAttribute("data-amb-done", "1");
                t.inside.appendChild(document.createTextNode(" "));
                t.inside.appendChild(chip(type));
            } else {
                t.node.setAttribute("data-amb-done", "1");
                t.node.insertAdjacentElement("afterend", chip(type));
            }
        });
    }

    async function run() {
        timer = null;

        const need = [];
        targets().forEach(function (t) {
            if (known[t.id] === undefined && need.indexOf(t.id) === -1) need.push(t.id);
        });

        if (need.length) {
            for (let i = 0; i < need.length; i += 100) {
                const batch = need.slice(i, i + 100);
                batch.forEach(function (id) { known[id] = ""; });

                try {
                    const { data } = await db.rpc("ambassador_badges", { p_ids: batch });
                    (data || []).forEach(function (row) { known[row.user_id] = row.ambassador_type; });
                } catch (e) {}
            }
        }

        paint();
    }

    function schedule() {
        if (timer) return;
        timer = setTimeout(run, 400);
    }

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    schedule();
})();