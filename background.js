const PROXY_URL = "https://ai-summarizer-proxy-psi.vercel.app/api/summarize";

async function getCachedSummary(url, mode) {
    const cacheKey = `${url}:${mode}`;
    return new Promise((resolve) => {
        chrome.storage.local.get([cacheKey], (result) => {
            const entry = result[cacheKey];
            if (!entry) return resolve(null);

            const ONE_HOUR = 60 * 60 * 1000;
            const isExpired = Date.now() - entry.cachedAt > ONE_HOUR;

            resolve(isExpired ? null : entry.summary);
        });
    });
}

async function cacheSummary(url, mode, summary) {
    const cacheKey = `${url}:${mode}`;
    return new Promise((resolve) => {
        chrome.storage.local.set({
            [cacheKey]: {
                summary,
                cachedAt: Date.now()
            }
        }, resolve);
    });
}

async function getPageContent(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: "GET_CONTENT" }, async (response) => {
            if (chrome.runtime.lastError) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId },
                        files: ["content.js"]
                    });

                    chrome.tabs.sendMessage(tabId, { action: "GET_CONTENT" }, (retryResponse) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error("Please refresh the page and try again."));
                            return;
                        }
                        if (!retryResponse?.success) {
                            reject(new Error(retryResponse?.error || "Please refresh the page and try again."));
                            return;
                        }
                        resolve(retryResponse.data);
                    });

                } catch {
                    reject(new Error("Please refresh the page and try again."));
                }
                return;
            }

            if (!response?.success) {
                reject(new Error(response?.error || "Please refresh the page and try again."));
                return;
            }

            resolve(response.data);
        });
    });
}

async function callProxy(content, mode = "full") {
    const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mode })
    });

    const text = await response.text();

    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Proxy returned invalid response: ${text.slice(0, 100)}`);
    }

    if (!response.ok) {
        throw new Error(data?.error || "Proxy request failed. Please try again.");
    }

    return data.summary;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.action === "SUMMARIZE") {
        (async () => {
            try {
                const cached = await getCachedSummary(message.url, message.mode);

                if (cached) {
                    sendResponse({ success: true, summary: cached, fromCache: true });
                    return;
                }

                const content = await getPageContent(message.tabId);
                const summary = await callProxy(content, message.mode);

                await cacheSummary(message.url, message.mode, summary);
                sendResponse({ success: true, summary, fromCache: false });

            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true;
    }

    if (message.action === "CLEAR_CACHE") {
        const cacheKey = `${message.url}:${message.mode}`;
        chrome.storage.local.remove([cacheKey], () => {
            sendResponse({ success: true });
        });
        return true;
    }

});