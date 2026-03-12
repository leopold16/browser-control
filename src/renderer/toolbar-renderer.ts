const toolbarApi = (window as any).browserAPI as {
  navigate: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  refresh: () => void;
  toggleControlPlane: () => void;
  toggleSidebar: () => void;
  getBrowserState: () => Promise<{
    activePage: {
      url: string;
      title: string;
      loading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    } | null;
    controlPlaneOpen: boolean;
    sidebarOpen: boolean;
  }>;
  onPageState: (
    callback: (state: {
      url: string;
      title: string;
      loading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    } | null) => void
  ) => void;
  onControlPlaneToggled: (callback: (open: boolean) => void) => void;
  onSidebarToggled: (callback: (open: boolean) => void) => void;
};

const urlBar = document.getElementById('url-bar') as HTMLInputElement;
const pageTitle = document.getElementById('page-title')!;
const pageMeta = document.getElementById('page-meta')!;
const backBtn = document.getElementById('back-btn') as HTMLButtonElement;
const forwardBtn = document.getElementById('forward-btn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const controlPlaneBtn = document.getElementById('control-plane-btn') as HTMLButtonElement;
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement;

function toDisplayUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return rawUrl;
  }
}

function renderPageState(
  state: {
    url: string;
    title: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
  } | null
): void {
  if (!state) {
    pageTitle.textContent = 'New page';
    pageMeta.textContent = 'Ready';
    return;
  }

  if (document.activeElement !== urlBar) {
    urlBar.value = state.url;
  }

  pageTitle.textContent = state.title || 'New page';
  pageMeta.textContent = state.loading ? 'Loading…' : toDisplayUrl(state.url);
  backBtn.disabled = !state.canGoBack;
  forwardBtn.disabled = !state.canGoForward;
  refreshBtn.dataset.loading = state.loading ? 'true' : 'false';
  refreshBtn.innerHTML = state.loading
    ? '<span class="spinner"></span>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
}

urlBar.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    const value = urlBar.value.trim();
    if (value) {
      toolbarApi.navigate(value);
      urlBar.blur();
    }
  } else if (event.key === 'Escape') {
    urlBar.blur();
  }
});

urlBar.addEventListener('focus', () => urlBar.select());

backBtn.addEventListener('click', () => toolbarApi.goBack());
forwardBtn.addEventListener('click', () => toolbarApi.goForward());
refreshBtn.addEventListener('click', () => toolbarApi.refresh());
controlPlaneBtn.addEventListener('click', () => toolbarApi.toggleControlPlane());
sidebarToggleBtn.addEventListener('click', () => toolbarApi.toggleSidebar());

toolbarApi.onPageState((state) => renderPageState(state));
toolbarApi.onControlPlaneToggled((open) => {
  controlPlaneBtn.classList.toggle('active', open);
});
toolbarApi.onSidebarToggled((open) => {
  sidebarToggleBtn.classList.toggle('active', open);
});

toolbarApi.getBrowserState().then((state) => {
  renderPageState(state.activePage);
  controlPlaneBtn.classList.toggle('active', state.controlPlaneOpen);
  sidebarToggleBtn.classList.toggle('active', state.sidebarOpen);
});
