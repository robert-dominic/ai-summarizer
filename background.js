const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function getApiKey() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(["apiKey"], (result) => {
            if (result.apiKey) {
                resolve(result.apiKey);
            } else {
                reject(new Error("No API key found. Please add your Gemini API key in settings."));
            }
        });
    });
}

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

async function callGemini(apiKey, content, mode = "full") {
    const prompt = mode === "brief"
        ? `Summarize this webpage in exactly 3 bullet points. Each bullet must be one sentence only, maximum 20 words. No intro, no outro, just the 3 bullets.

Format exactly like this:
- First key point here
- Second key point here
- Third key point here

Title: ${content.title}
Content: ${content.content}`

        : `Analyze this webpage and respond in this exact structure. Keep each section tight and concise.

**Summary**
Write 2-3 sentences max. Plain prose, no bullets.

**Key Insights**
- First important takeaway in one sentence
- Second important takeaway in one sentence
- Third important takeaway in one sentence
- Fourth important takeaway in one sentence (if relevant)

**Estimated Reading Time**
X min read

Title: ${content.title}
Content: ${content.content}`;

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: mode === "breif" ? 120 : 2048
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error?.message || "Gemini API request failed. Please try again.");
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.action === "SUMMARIZE") {
        (async () => {
            try {
                const apiKey = await getApiKey();
                const cached = await getCachedSummary(message.url, message.mode);

                if (cached) {
                    sendResponse({ success: true, summary: cached, fromCache: true });
                    return;
                }

                const content = await getPageContent(message.tabId);
                const summary = await callGemini(apiKey, content, message.mode);

                await cacheSummary(message.url, message.mode, summary);
                sendResponse({ success: true, summary, fromCache: false });

            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true;
    }

    if (message.action === "SAVE_KEY") {
        chrome.storage.local.set({ apiKey: message.apiKey }, () => {
            sendResponse({ success: true });
        });
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