import { BaseWindow, WebContentsView } from 'electron';

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
  loading: boolean;
}

interface Tab {
  id: string;
  view: WebContentsView;
  loading: boolean;
}

let mainWindow: BaseWindow | null = null;
let toolbarView: WebContentsView | null = null;
let sidebarView: WebContentsView | null = null;
let controlPlaneView: WebContentsView | null = null;
let controlPlaneOpen = true;
const tabs: Tab[] = [];
let activeTabId: string | null = null;
let nextTabId = 1;

const TOOLBAR_HEIGHT = 72;
const SIDEBAR_WIDTH = 280;
const CONTROL_PLANE_WIDTH = 280;
let sidebarOpen = true;

export function init(window: BaseWindow, toolbar: WebContentsView, sidebar: WebContentsView): void {
  mainWindow = window;
  toolbarView = toolbar;
  sidebarView = sidebar;
}

export function setControlPlaneView(view: WebContentsView): void {
  controlPlaneView = view;
}

export function toggleControlPlane(): boolean {
  controlPlaneOpen = !controlPlaneOpen;

  if (controlPlaneView) {
    controlPlaneView.setVisible(controlPlaneOpen);
  }

  updateAllBounds();
  toolbarView?.webContents.send('control-plane-toggled', controlPlaneOpen);
  return controlPlaneOpen;
}

export function isControlPlaneOpen(): boolean {
  return controlPlaneOpen;
}

export function toggleSidebar(): boolean {
  sidebarOpen = !sidebarOpen;

  if (sidebarView) {
    sidebarView.setVisible(sidebarOpen);
  }

  updateAllBounds();
  toolbarView?.webContents.send('sidebar-toggled', sidebarOpen);
  return sidebarOpen;
}

export function isSidebarOpen(): boolean {
  return sidebarOpen;
}

function ensureUiOrdering(): void {
  if (!mainWindow) return;

  for (const view of [sidebarView, toolbarView, controlPlaneView]) {
    if (!view) continue;
    mainWindow.contentView.removeChildView(view);
    mainWindow.contentView.addChildView(view);
  }
}

function attachTabEvents(tab: Tab): void {
  const contents = tab.view.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });

  contents.on('did-navigate', () => notifyUi());
  contents.on('did-navigate-in-page', () => notifyUi());
  contents.on('page-title-updated', () => notifyUi());
  contents.on('did-start-loading', () => {
    tab.loading = true;
    notifyUi();
  });
  contents.on('did-stop-loading', () => {
    tab.loading = false;
    notifyUi();
  });
  contents.on('did-fail-load', () => {
    tab.loading = false;
    notifyUi();
  });
}

export function createTab(url: string = 'https://www.google.com'): Tab {
  const id = String(nextTabId++);
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });
  view.setBackgroundColor('#050508');

  const tab: Tab = { id, view, loading: false };
  attachTabEvents(tab);
  tabs.push(tab);
  mainWindow!.contentView.addChildView(view);
  ensureUiOrdering();

  activateTab(id);
  view.webContents.loadURL(url);
  notifyUi();
  return tab;
}

export function closeTab(id: string): boolean {
  const idx = tabs.findIndex((tab) => tab.id === id);
  if (idx === -1) return false;

  const tab = tabs[idx];
  mainWindow!.contentView.removeChildView(tab.view);
  tab.view.webContents.close();
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    createTab('https://www.google.com');
    return true;
  }

  if (activeTabId === id) {
    const nextIndex = Math.min(idx, tabs.length - 1);
    activateTab(tabs[nextIndex].id);
  }

  notifyUi();
  return true;
}

export function activateTab(id: string): boolean {
  const tab = tabs.find((entry) => entry.id === id);
  if (!tab) return false;

  activeTabId = id;

  for (const entry of tabs) {
    if (entry.id === id) {
      entry.view.setVisible(true);
      updateTabBounds(entry.view);
    } else {
      entry.view.setVisible(false);
    }
  }

  notifyUi();
  return true;
}

export function getActiveTab(): Tab | null {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

export function getTab(id: string): Tab | null {
  return tabs.find((tab) => tab.id === id) || null;
}

export function listTabs(): TabInfo[] {
  return tabs.map((tab) => ({
    id: tab.id,
    url: tab.view.webContents.getURL(),
    title: tab.view.webContents.getTitle() || 'New page',
    active: tab.id === activeTabId,
    loading: tab.loading,
  }));
}

export function getActivePageState(): {
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
} | null {
  const active = getActiveTab();
  if (!active) return null;

  return {
    url: active.view.webContents.getURL(),
    title: active.view.webContents.getTitle() || 'New page',
    loading: active.loading,
    canGoBack: active.view.webContents.canGoBack(),
    canGoForward: active.view.webContents.canGoForward(),
  };
}

function getContentBounds(): { x: number; y: number; width: number; height: number } {
  if (!mainWindow) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const bounds = mainWindow.getBounds();
  const leftInset = sidebarOpen ? SIDEBAR_WIDTH : 0;
  const rightInset = controlPlaneOpen ? CONTROL_PLANE_WIDTH : 0;
  return {
    x: leftInset,
    y: TOOLBAR_HEIGHT,
    width: Math.max(320, bounds.width - leftInset - rightInset),
    height: Math.max(200, bounds.height - TOOLBAR_HEIGHT),
  };
}

function updateTabBounds(view: WebContentsView): void {
  view.setBounds(getContentBounds());
}

function updateToolbarBounds(): void {
  if (!mainWindow || !toolbarView) return;
  const bounds = mainWindow.getBounds();
  const leftInset = sidebarOpen ? SIDEBAR_WIDTH : 0;
  const rightInset = controlPlaneOpen ? CONTROL_PLANE_WIDTH : 0;
  toolbarView.setBounds({
    x: leftInset,
    y: 0,
    width: Math.max(320, bounds.width - leftInset - rightInset),
    height: TOOLBAR_HEIGHT,
  });
}

function updateSidebarBounds(): void {
  if (!mainWindow || !sidebarView || !sidebarOpen) return;
  const bounds = mainWindow.getBounds();
  sidebarView.setBounds({
    x: 0,
    y: 0,
    width: SIDEBAR_WIDTH,
    height: bounds.height,
  });
}

function updateControlPlaneBounds(): void {
  if (!mainWindow || !controlPlaneView || !controlPlaneOpen) return;
  const bounds = mainWindow.getBounds();
  controlPlaneView.setBounds({
    x: bounds.width - CONTROL_PLANE_WIDTH,
    y: 0,
    width: CONTROL_PLANE_WIDTH,
    height: bounds.height,
  });
}

export function updateAllBounds(): void {
  const active = getActiveTab();
  if (active) {
    updateTabBounds(active.view);
  }

  updateToolbarBounds();

  if (sidebarView) {
    sidebarView.setVisible(sidebarOpen);
  }
  updateSidebarBounds();

  if (controlPlaneView) {
    controlPlaneView.setVisible(controlPlaneOpen);
  }
  updateControlPlaneBounds();
  ensureUiOrdering();
}

export function notifyUi(): void {
  const tabsState = listTabs();
  const pageState = getActivePageState();

  sidebarView?.webContents.send('tabs-changed', tabsState);
  toolbarView?.webContents.send('tabs-changed', tabsState);
  toolbarView?.webContents.send('page-state', pageState);
  controlPlaneView?.webContents.send('page-state', pageState);

  if (pageState) {
    sidebarView?.webContents.send('page-state', pageState);
  }
}
