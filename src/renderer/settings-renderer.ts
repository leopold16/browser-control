// Settings side panel renderer — no imports/exports.
// Variable names prefixed to avoid TS conflict with renderer.ts (shared script scope).

const settingsApi = (window as any).browserAPI as {
  getApiKey: () => Promise<string>;
  toggleSettings: () => void;
};

const panelCloseBtn = document.getElementById('close-btn')!;
const panelApiKeyEl = document.getElementById('api-key')!;
const panelApiUrlEl = document.getElementById('api-url')!;

panelCloseBtn.addEventListener('click', () => settingsApi.toggleSettings());

function panelCopyToClipboard(el: HTMLElement) {
  const text = el.textContent || '';
  navigator.clipboard.writeText(text);
  const original = el.textContent;
  el.textContent = 'Copied!';
  el.classList.add('copied');
  setTimeout(() => {
    el.textContent = original;
    el.classList.remove('copied');
  }, 1200);
}

panelApiUrlEl.addEventListener('click', () => panelCopyToClipboard(panelApiUrlEl));
panelApiKeyEl.addEventListener('click', () => panelCopyToClipboard(panelApiKeyEl));

settingsApi.getApiKey().then((key) => {
  panelApiKeyEl.textContent = key;
});
