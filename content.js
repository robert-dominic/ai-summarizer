function extractPageContent() {
    const unwanted = [
        "nav", "header", "footer", "aside",
        "script", "style", "noscript",
        '[role="navigation"]', '[role="banner"]',
        '[role="complementary"]', ".sidebar",
        ".advertisement", ".ads", ".cookie-banner"
    ];

    const cloned = document.body.cloneNode(true);

    unwanted.forEach(selector => {
        cloned.querySelectorAll(selector).forEach(el => el.remove());
    });

    const priority = [
        "article",
        '[role="main"]',
        "main",
        ".post-content",
        ".article-content",
        ".entry-content",
        ".content",
        ".post-body"
    ];

    let mainElement = null;

    for (const selector of priority) {
        const found = cloned.querySelector(selector);
        if (found && found.innerText.trim().length > 200) {
            mainElement = found;
            break;
        }
    }

    const rawText = mainElement
        ? mainElement.innerText
        : cloned.innerText;

    const cleaned = rawText
        .replace(/\s+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 15000);

    return {
        title: document.title,
        content: cleaned,
        wordCount: cleaned.split(/\s+/).filter(Boolean).length
    };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "GET_CONTENT") {
        try {
            const data = extractPageContent();
            sendResponse({ success: true, data });
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    }
    return true;
});