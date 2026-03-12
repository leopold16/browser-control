// No imports/exports — this runs as a plain browser script.
// window.browserAPI is injected by the preload script via contextBridge.

const api = (window as any).browserAPI as {
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
  newTab: (url?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  getApiKey: () => Promise<string>;
  toggleSettings: () => void;
  onUrlChanged: (cb: (url: string) => void) => void;
  onTitleChanged: (cb: (title: string) => void) => void;
  onTabsChanged: (cb: (tabs: any[]) => void) => void;
  onLoading: (cb: (loading: boolean) => void) => void;
  onSettingsToggled: (cb: (open: boolean) => void) => void;
};

const urlBar = document.getElementById('url-bar') as HTMLInputElement;
const backBtn = document.getElementById('back-btn')!;
const forwardBtn = document.getElementById('forward-btn')!;
const refreshBtn = document.getElementById('refresh-btn')!;
const newTabBtn = document.getElementById('new-tab-btn')!;
const settingsBtn = document.getElementById('settings-btn')!;
const tabBar = document.getElementById('tab-bar')!;

// URL bar
urlBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = urlBar.value.trim();
    if (url) {
      api.navigate(url);
      urlBar.blur();
    }
  }
  if (e.key === 'Escape') {
    urlBar.blur();
  }
});

urlBar.addEventListener('focus', () => urlBar.select());

// Navigation
backBtn.addEventListener('click', () => api.goBack());
forwardBtn.addEventListener('click', () => api.goForward());
refreshBtn.addEventListener('click', () => api.refresh());
newTabBtn.addEventListener('click', () => api.newTab());

// Settings toggle — opens/closes the side panel
settingsBtn.addEventListener('click', () => api.toggleSettings());

// Highlight gear when panel is open
api.onSettingsToggled((open) => {
  settingsBtn.classList.toggle('active', open);
});

// Tab rendering
function renderTabs(tabs: any[]) {
  const existing = tabBar.querySelectorAll('.tab');
  existing.forEach((el) => el.remove());

  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.active ? ' active' : '');

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'New Tab';

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.innerHTML = '&#215;';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      api.closeTab(tab.id);
    });

    el.appendChild(title);
    el.appendChild(close);
    el.addEventListener('click', () => api.activateTab(tab.id));

    tabBar.insertBefore(el, newTabBtn);
  }
}

// Events from main process
api.onUrlChanged((url) => {
  if (document.activeElement !== urlBar) {
    urlBar.value = url;
  }
});

api.onTabsChanged((tabs) => renderTabs(tabs));

api.onLoading((loading) => {
  refreshBtn.innerHTML = loading
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
});

export {};
