// Turns a normal video link into a safe embeddable one.
// Only YouTube, Vimeo and Google Drive are accepted.
function toEmbedUrl(link) {
    let url;
    try {
        url = new URL(String(link).trim());
    } catch (e) {
        return null;
    }

    if (url.protocol !== "https:") return null;

    const host = url.hostname.replace(/^www\./, "");
    let id = null;

    if (host === "youtu.be") {
        id = url.pathname.slice(1);
    } else if (host === "youtube.com" || host === "m.youtube.com") {
        if (url.pathname === "/watch") {
            id = url.searchParams.get("v");
        } else {
            const match = url.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/);
            if (match) id = match[2];
        }
    }

    if (id && /^[\w-]{6,}$/.test(id)) {
        return "https://www.youtube.com/embed/" + id;
    }

    if (host === "vimeo.com") {
        const match = url.pathname.match(/^\/(\d+)/);
        if (match) return "https://player.vimeo.com/video/" + match[1];
    }

    if (host === "drive.google.com") {
        const match = url.pathname.match(/^\/file\/d\/([\w-]+)/);
        if (match) return "https://drive.google.com/file/d/" + match[1] + "/preview";
    }

    return null;
}