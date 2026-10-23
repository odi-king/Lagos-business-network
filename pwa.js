// Makes the site installable and shows a small "Install app" prompt.

if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function (error) {
            console.error("Service worker failed:", error);
        });
    });
}

(function () {
    const alreadyInstalled =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    if (alreadyInstalled || localStorage.getItem("installBarDismissed") === "yes") {
        return;
    }

    let installEvent = null;

    function showBar(text, buttonText, onClick) {
        const bar = document.createElement("div");
        bar.className = "install-bar";

        const message = document.createElement("span");
        message.textContent = text;
        bar.appendChild(message);

        if (buttonText) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "contact-btn";
            button.textContent = buttonText;
            button.addEventListener("click", function () {
                onClick();
                bar.remove();
            });
            bar.appendChild(button);
        }

        const close = document.createElement("button");
        close.type = "button";
        close.className = "install-close";
        close.setAttribute("aria-label", "Close");
        close.textContent = "\u00D7";
        close.addEventListener("click", function () {
            localStorage.setItem("installBarDismissed", "yes");
            bar.remove();
        });
        bar.appendChild(close);

        document.body.appendChild(bar);
    }

    // Android and desktop Chrome
    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        installEvent = event;
        showBar("Install the Lagos Business Network app", "Install", function () {
            installEvent.prompt();
        });
    });

    // iPhone Safari has no install button, so show the steps instead
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
        window.addEventListener("load", function () {
            showBar("To install: tap the Share button, then Add to Home Screen.");
        });
    }
})();