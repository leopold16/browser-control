import { BaseWindow, WebContentsView } from 'electron';
import * as path from 'path';

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  active: boolean;
}

interface Tab {
  id: string;
  view: WebContentsView;
}

let mainWindow: BaseWindow | null = null;
let chromeView: WebContentsView | null = null;
let settingsView: WebContentsView | null = null;
let settingsOpen = false;
const tabs: Tab[] = [];
let activeTabId: string | null = null;
let nextTabId = 1;

const CHROME_HEIGHT = 78;
const SETTINGS_WIDTH = 340;

export function init(window: BaseWindow, chrome: WebContentsView): void {
  mainWindow = window;
  chromeView = chrome;
}

export function setSettingsView(view: WebContentsView): void {
  settingsView = view;
}

export function toggleSettings(): boolean {
  settingsOpen = !settingsOpen;

  if (settingsView) {
    settingsView.setVisible(settingsOpen);
  }

  updateAllBounds();
  chromeView?.webContents.send('settings-toggled', settingsOpen);
  return settingsOpen;
}

export function isSettingsOpen(): boolean {
  return settingsOpen;
}

export function createTab(url?: string): Tab {
  const id = String(nextTabId++);
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url);
    return { action: 'deny' };
  });

  view.webContents.on('did-navigate', () => notifyChrome());
  view.webContents.on('did-navigate-in-page', () => notifyChrome());
  view.webContents.on('page-title-updated', () => notifyChrome());
  view.webContents.on('did-start-loading', () => {
    chromeView?.webContents.send('loading', true);
  });
  view.webContents.on('did-stop-loading', () => {
    chromeView?.webContents.send('loading', false);
    notifyChrome();
  });

  const tab: Tab = { id, view };
  tabs.push(tab);
  mainWindow!.contentView.addChildView(view);

  // Ensure settings view stays on top
  if (settingsView && settingsOpen) {
    mainWindow!.contentView.removeChildView(settingsView);
    mainWindow!.contentView.addChildView(settingsView);
  }

  activateTab(id);
  if (url) {
    view.webContents.loadURL(url);
  }

  notifyChrome();
  return tab;
}

export function closeTab(id: string): boolean {
  const idx = tabs.findIndex((t) => t.id === id);
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
    const newIdx = Math.min(idx, tabs.length - 1);
    activateTab(tabs[newIdx].id);
  }

  notifyChrome();
  return true;
}

export function activateTab(id: string): boolean {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return false;

  activeTabId = id;

  for (const t of tabs) {
    if (t.id === id) {
      t.view.setVisible(true);
      updateTabBounds(t.view);
    } else {
      t.view.setVisible(false);
    }
  }

  notifyChrome();
  return true;
}

export function getActiveTab(): Tab | null {
  return tabs.find((t) => t.id === activeTabId) || null;
}

export function getTab(id: string): Tab | null {
  return tabs.find((t) => t.id === id) || null;
}

export function listTabs(): TabInfo[] {
  return tabs.map((t) => ({
    id: t.id,
    url: t.view.webContents.getURL(),
    title: t.view.webContents.getTitle(),
    active: t.id === activeTabId,
  }));
}

function getContentWidth(): number {
  if (!mainWindow) return 0;
  const bounds = mainWindow.getBounds();
  return settingsOpen ? bounds.width - SETTINGS_WIDTH : bounds.width;
}

function updateTabBounds(view: WebContentsView): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const contentWidth = getContentWidth();
  view.setBounds({
    x: 0,
    y: CHROME_HEIGHT,
    width: contentWidth,
    height: bounds.height - CHROME_HEIGHT,
  });
}

function updateSettingsBounds(): void {
  if (!mainWindow || !settingsView) return;
  const bounds = mainWindow.getBounds();
  settingsView.setBounds({
    x: bounds.width - SETTINGS_WIDTH,
    y: CHROME_HEIGHT,
    width: SETTINGS_WIDTH,
    height: bounds.height - CHROME_HEIGHT,
  });
}

export function updateAllBounds(): void {
  const tab = getActiveTab();
  if (tab) {
    updateTabBounds(tab.view);
  }
  if (chromeView && mainWindow) {
    const bounds = mainWindow.getBounds();
    chromeView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: CHROME_HEIGHT,
    });
  }
  if (settingsView && settingsOpen) {
    updateSettingsBounds();
  }
}

function notifyChrome(): void {
  if (!chromeView) return;
  const active = getActiveTab();
  chromeView.webContents.send('tabs-changed', listTabs());
  if (active) {
    chromeView.webContents.send('url-changed', active.view.webContents.getURL());
    chromeView.webContents.send('title-changed', active.view.webContents.getTitle());
  }
}
