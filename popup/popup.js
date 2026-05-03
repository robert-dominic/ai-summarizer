'use strict';

let currentTab = null;
let currentMode = 'full';
let currentSummary = '';

const $ = id => document.getElementById(id);

const themeToggle = $('theme-toggle');
const themeIcon = $('theme-icon');
const settingsToggle = $('settings-toggle');
const apiKeyInput = $('api-key-input');
const saveKeyBtn = $('save-key-btn');
const pageTitle = $('page-title');
const pageDomain = $('page-domain');
const modeFull = $('mode-full');
const modeBrief = $('mode-brief');
const summarizeBtn = $('summarize-btn');
const loadingEl = $('loading');
const errorBox = $('error-box');
const errorText = $('error-text');
const retryBtn = $('retry-btn');
const resultEl = $('result');
const resultBody = $('result-body');
const wordCount = $('word-count');
const copyBtn = $('copy-btn');
const clearBtn = $('clear-btn');

document.addEventListener('DOMContentLoaded', init);

async function init() {
    loadTheme();
    await loadCurrentTab();
    await checkApiKey();
}

/* Theme */

function loadTheme() {
    chrome.storage.local.get(['theme'], result => {
        setTheme(result.theme || 'dark');
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeIcon.src = theme === 'dark'
        ? '../icons/sun.svg'
        : '../icons/moon.svg';
    themeIcon.alt = theme === 'dark'
        ? 'Switch to light mode'
        : 'Switch to dark mode';
}

themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light'
        : 'dark';
    setTheme(next);
    chrome.storage.local.set({ theme: next });
});

/* Settings panel */

const modalOverlay = $('modal-overlay');
const modalClose = $('modal-close');
const banner = $('banner');

function openModal() {
    modalOverlay.hidden = false;
    apiKeyInput.focus();
}

function closeModal() {
    modalOverlay.hidden = true;
}

settingsToggle.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);

modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
});

saveKeyBtn.addEventListener('click', saveApiKey);
apiKeyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveApiKey();
});

function saveApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        apiKeyInput.focus();
        return;
    }

    chrome.runtime.sendMessage({ action: 'SAVE_KEY', apiKey: key }, response => {
        if (response?.success) {
            apiKeyInput.value = '';
            closeModal();
            banner.hidden = true;
            saveKeyBtn.textContent = 'Saved ✓';
            setTimeout(() => { saveKeyBtn.textContent = 'Save key'; }, 1500);
        }
    });
}

async function checkApiKey() {
    return new Promise(resolve => {
        chrome.storage.local.get(['apiKey'], result => {
            if (!result.apiKey) {
                banner.hidden = false;
            }
            resolve();
        });
    });
}

/* Current tab */

async function loadCurrentTab() {
    return new Promise(resolve => {
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (!tabs[0]) return resolve();

            currentTab = tabs[0];
            pageTitle.textContent = tabs[0].title || 'Untitled page';

            try {
                pageDomain.textContent = new URL(tabs[0].url).hostname;
            } catch {
                pageDomain.textContent = '';
            }

            resolve();
        });
    });
}

/* Mode toggle */

modeFull.addEventListener('click', () => setMode('full'));
modeBrief.addEventListener('click', () => setMode('brief'));

function setMode(mode) {
    currentMode = mode;
    modeFull.classList.toggle('active', mode === 'full');
    modeBrief.classList.toggle('active', mode === 'brief');
    modeFull.setAttribute('aria-pressed', String(mode === 'full'));
    modeBrief.setAttribute('aria-pressed', String(mode === 'brief'));
}

/* Summarize */

summarizeBtn.addEventListener('click', summarize);
retryBtn.addEventListener('click', summarize);

function summarize() {
    if (!currentTab) return;
    if (!modalOverlay.hidden) closeModal();

    showState('loading');

    chrome.runtime.sendMessage({
        action: 'SUMMARIZE',
        tabId: currentTab.id,
        url: currentTab.url,
        mode: currentMode
    }, response => {
        if (chrome.runtime.lastError) {
            showError('Extension error. Close and reopen the popup.');
            return;
        }
        if (!response?.success) {
            showError(response?.error || 'Something went wrong. Please try again.');
            return;
        }

        currentSummary = response.summary;
        buildResult(response.summary, response.fromCache);
        showState('result');
    });
}

/* State management */

function showState(state) {
    loadingEl.hidden = state !== 'loading';
    errorBox.hidden = state !== 'error';
    resultEl.hidden = state !== 'result';
    summarizeBtn.disabled = state === 'loading';
}

function showError(message) {
    errorText.textContent = message;
    showState('error');
}

/* Build result (XSS-safe, no innerHTML for AI content) */

function buildResult(text, fromCache) {
    resultBody.innerHTML = '';

    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);

    lines.forEach(line => {

        if (line.startsWith('**') && line.endsWith('**')) {
            const el = document.createElement('p');
            el.className = 'r-label';
            el.textContent = line.replace(/\*\*/g, '');
            resultBody.appendChild(el);
            return;
        }

        if (line.startsWith('- ') || line.startsWith('* ')) {
            const wrap = document.createElement('div');
            wrap.className = 'r-bullet';

            const dot = document.createElement('span');
            dot.className = 'r-bullet-dot';
            dot.textContent = '▸';

            const txt = document.createElement('p');
            txt.className = 'r-bullet-text';
            txt.textContent = line.replace(/^[-*]\s/, '');

            wrap.appendChild(dot);
            wrap.appendChild(txt);
            resultBody.appendChild(wrap);
            return;
        }

        if (line.toLowerCase().includes('min read') || line.toLowerCase().includes('minute')) {
            const el = document.createElement('span');
            el.className = 'r-time';
            el.textContent = line;
            resultBody.appendChild(el);
            return;
        }

        const el = document.createElement('p');
        el.className = 'r-para';
        el.textContent = line;
        resultBody.appendChild(el);
    });

    const words = text.split(/\s+/).filter(Boolean).length;
    wordCount.textContent = `${words.toLocaleString()} words`;

    if (fromCache) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:10px;color:var(--gold);margin-left:8px;letter-spacing:0.05em';
        badge.textContent = '· cached';
        wordCount.appendChild(badge);
    }
}

/* Copy */

copyBtn.addEventListener('click', () => {
    if (!currentSummary) return;

    navigator.clipboard.writeText(currentSummary).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.innerHTML =
                '<img src="../icons/copy.svg" width="13" height="13" alt=""/> Copy';
        }, 1500);
    }).catch(() => {
        showError('Failed to copy. Please try manually.');
    });
});

/* Clear cache */

clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
        action: 'CLEAR_CACHE',
        url: currentTab.url,
        mode: currentMode
    }, response => {
        if (response?.success) {
            clearBtn.textContent = 'Cleared!';
            setTimeout(() => {
                clearBtn.innerHTML =
                    '<img src="../icons/trash-2.svg" width="13" height="13" alt=""/> Clear cache';
            }, 1500);
        }
    });
});