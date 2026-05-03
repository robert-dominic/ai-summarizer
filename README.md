# AI Page Summarizer

A Manifest V3 Chrome Extension that extracts content from any webpage and returns a structured AI-powered summary using Google Gemini — with bullet points, key insights, and estimated reading time, all without ever exposing your API key.

---

## Deliverable Links

- **Video Walkthrough**: [Google Drive Link]()

---

## What It Does

Most pages take 8–15 minutes to read. This extension reads them for you in seconds.

Open any article, blog post, Wikipedia page, or news piece — click the extension icon, hit **Summarize page**, and get back a clean structured breakdown of what actually matters. Switch to **Brief mode** for a tight 3-bullet digest when you need the gist fast.

---

## Features

- **Full summary** — structured output with summary, key insights, and reading time
- **Brief mode** — exactly 3 bullet points, nothing more
- **Per-page, per-mode caching** — summaries are cached separately by URL and mode; clearing brief cache does not affect full summary cache
- **1-hour cache TTL** — dynamic pages get fresh summaries after an hour automatically
- **Dark / light mode** — persisted across sessions
- **Copy to clipboard** — one click to copy the full summary
- **Word count** — displayed on every result
- **Settings modal** — clean overlay for API key management
- **First-time onboarding banner** — guides new users to add their key before anything else
- **Graceful error handling** — every failure state gives the user a clear, actionable message

---

## Setup Instructions

This is a local extension. It is not published on the Chrome Web Store.

### Prerequisites

- Google Chrome browser
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey) — no credit card required

### Installation

1. Download or clone this repository:

```bash
git clone https://github.com/robert-dominic/ai-summarizer.git
```

2. Open Chrome and navigate to:

```
chrome://extensions
```

3. Toggle on **Developer mode** in the top right corner.

4. Click **Load unpacked**.

5. Select the `ai-summarizer` folder.

6. The extension will appear in your extensions list. Pin it to your toolbar by clicking the puzzle icon and pinning **AI Page Summarizer**.

### Adding Your API Key

1. Click the extension icon on any webpage
2. Click the **key icon** in the top right of the popup
3. Paste your Gemini API key into the input field
4. Click **Save key**

Your key is stored locally on your device using `chrome.storage.local`. It is never sent anywhere except directly to the Gemini API when you request a summary.

---

## How to Use

1. Navigate to any article or webpage you want to summarize
2. Click the **AI Page Summarizer** icon in your toolbar
3. Choose your mode — **Full summary** or **Brief · 3 bullets**
4. Click **Summarize page**
5. Read the result, copy it, or clear its cache — all from the popup


## Troubleshooting

If the extension does not respond on first use after installation, refresh the page and try again. This happens because content scripts only auto-inject into pages loaded after the extension is installed.

---

## File Structure

```
ai-summarizer/
├── manifest.json          # Extension configuration and permissions
├── background.js          # Service worker — handles API calls and caching
├── content.js             # Content script — extracts page text from DOM
├── popup/
│   ├── popup.html         # Popup UI markup
│   ├── popup.js           # Popup logic — state management and messaging
│   └── popup.css          # Styles — dark/light mode, all UI components
├── icons/                 # Extension icons and UI SVGs
└── README.md
```

---

## Architecture

The extension is built across four isolated environments that communicate through Chrome's message passing system. No component has more access than it needs.

```
Webpage DOM
    ↕ (chrome.tabs.sendMessage)
Content Script          — reads and cleans page text, sends it up on request
    ↕ (chrome.runtime.sendMessage)
Background Service Worker — reads API key from storage, calls Gemini, caches result
    ↕ (sendResponse)
Popup UI                — triggers summarization, displays result, manages settings
    ↕ (chrome.storage.local)
Local Storage           — holds API key and cached summaries
```

### Content Script

`content.js` runs inside the webpage. When the background script sends a `GET_CONTENT` message, it:

1. Clones the document body to avoid mutating the live page
2. Strips navigation, headers, footers, sidebars, ads, and scripts from the clone
3. Searches for the main content using a priority selector list — `article`, `main`, `[role="main"]`, common CMS class names
4. Falls back to the cleaned body text if no priority element is found
5. Collapses whitespace, trims excess blank lines, and slices to 15,000 characters to stay within Gemini's context limits
6. Returns the extracted text, page title, and word count

### Background Service Worker

`background.js` is the only component that touches the Gemini API. It:

1. Reads the API key from `chrome.storage.local`
2. Checks for a valid cached summary for the current URL and mode
3. If no cache exists, requests page content from the content script
4. Constructs a structured prompt and calls the Gemini API
5. Caches the result with a timestamp under a `url:mode` key
6. Returns the summary to the popup

### Popup UI

`popup.html`, `popup.css`, and `popup.js` handle everything the user sees. The popup sends messages to the background worker and renders the response. It never makes API calls directly and never reads the API key — it only triggers the background to act.

---

## AI Integration

**Provider:** Google Gemini 2.5 Flash via the `generateContent` REST endpoint

**Endpoint:**
```
https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
```

**How prompts are structured:**

Full summary mode instructs Gemini to respond in a fixed structure — a 2-3 sentence prose summary, 3-5 bullet point key insights, and an estimated reading time. The prompt explicitly defines the output format using markdown section headers so the popup can parse and render each section consistently.

Brief mode instructs Gemini to return exactly 3 bullet points, one sentence each, with no introduction or closing text.

**Model configuration:**
```json
{
  "temperature": 0.3,
  "maxOutputTokens": 2048
}
```

Low temperature keeps summaries factual and consistent. Higher temperature would produce more creative but less reliable output — wrong tradeoff for a summarization tool.

---

## Security Decisions

### API Key Storage
The API key lives in `chrome.storage.local` — a storage system that only this extension can access. It never gets written into `popup.js` or `content.js`, which are more exposed to anyone inspecting the extension. Only `background.js` reads it, and only in the moment it needs to make an API call. Once used, it goes nowhere else.

### XSS Prevention
When the summary comes back from Gemini, it gets built into the DOM piece by piece using `createElement` and `textContent` — never `innerHTML`. The reason is simple: if Gemini ever returned something unexpected containing HTML or script tags, `innerHTML` would execute it. With `textContent`, it just shows up as plain text on screen. The AI output is treated as data, not markup.

### Content Security Policy
The manifest includes a strict CSP that only allows scripts from within the extension itself to run. No external script sources, no inline scripts.

This blocks any inline scripts and external script sources from running inside the extension's pages.

### Minimal Permissions

| Permission | Why It's Needed |
|---|---|
| `activeTab` | Access the current tab the user is on |
| `storage` | Save API key and cached summaries |
| `scripting` | Programmatically inject content script if needed |
| `tabs` | Read tab title and URL for display and cache keying |

No `host_permissions` are declared beyond what `activeTab` and `content_scripts` already cover.

---

## Trade-offs

### Caching and Dynamic Pages
Summaries are cached per URL and per mode for one hour. That works fine for articles and documentation that don't change. But for news sites or pages that update frequently, the cached version might be outdated before the hour is up. A better long-term fix would be detecting when the page content has actually changed rather than relying purely on time — but for this version, one hour felt like a reasonable middle ground.

### API Key Setup
Every user needs to supply their own Gemini API key. The ideal approach would be running a small proxy server that holds one key on the backend — users would just install the extension and it works. I skipped that here to keep the extension fully self-contained with no server to maintain or worry about. The tradeoff is a slightly more involved first-time setup.

### Content Extraction
The content script uses a priority list of CSS selectors to find the main article text on a page — things like `article`, `main`, and common CMS class names. This works well on most standard blog and news layouts. It can struggle on pages that load content dynamically with JavaScript, have unusual structures, or sit behind a paywall. A more robust solution would use Mozilla's Readability library, which is what Firefox's reader mode is built on — I kept it manual here to avoid external dependencies.

### Output Length Limits
The Gemini API call is capped at 2048 tokens for full summaries and 120 for brief mode. Brief mode is intentionally tight to force concise output — without the token cap, Gemini would sometimes produce longer bullets than the full summary. On very long or dense pages, the full summary might not cover every section of the original content, but it covers what matters most.

---

## Local Development

No build tools required. The extension runs as plain HTML, CSS, and JavaScript.

1. Make changes to any file
2. Go to `chrome://extensions`
3. Click the refresh icon on the AI Page Summarizer card
4. Reopen the popup to see changes

For background script changes specifically, click the **service worker** link on the extension card to open its DevTools and inspect logs.

---

## Author

Built by WebNova