const sidebarApi = (window as any).browserAPI as {
  newTab: (url?: string) => void;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  getBrowserState: () => Promise<{ tabs: Array<any> }>;
  onTabsChanged: (callback: (tabs: any[]) => void) => void;
};

const tabsList = document.getElementById('tabs-list')!;
const newTabBtn = document.getElementById('new-tab-btn')!;

function hostLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'Search';
  }
}

function initialFor(rawUrl: string): string {
  return hostLabel(rawUrl).charAt(0).toUpperCase() || 'N';
}

function renderTabs(tabs: any[]): void {
  tabsList.replaceChildren();

  for (const tab of tabs) {
    const item = document.createElement('button');
    item.className = `tab-card${tab.active ? ' active' : ''}`;
    item.type = 'button';

    const avatar = document.createElement('div');
    avatar.className = 'tab-avatar';
    avatar.textContent = initialFor(tab.url);

    const meta = document.createElement('div');
    meta.className = 'tab-meta';

    const title = document.createElement('div');
    title.className = 'tab-title';
    title.textContent = tab.title || 'New page';

    const url = document.createElement('div');
    url.className = 'tab-url';
    url.textContent = tab.loading ? 'Loading…' : hostLabel(tab.url);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.innerHTML = '&times;';
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      sidebarApi.closeTab(tab.id);
    });

    meta.appendChild(title);
    meta.appendChild(url);
    item.appendChild(avatar);
    item.appendChild(meta);
    item.appendChild(close);
    item.addEventListener('click', () => sidebarApi.activateTab(tab.id));
    tabsList.appendChild(item);
  }
}

newTabBtn.addEventListener('click', () => sidebarApi.newTab());
sidebarApi.onTabsChanged((tabs) => renderTabs(tabs));
sidebarApi.getBrowserState().then((state) => renderTabs(state.tabs));
