import { app, ipcMain } from 'electron';

app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
import { createMainWindow } from './window';
import * as tabManager from './tab-manager';
import { startApiServer, stopApiServer } from './api-server';
import { getApiKey } from './auth';

app.whenReady().then(() => {
  const { window, chromeView, settingsView } = createMainWindow();

  // Create default tab
  tabManager.createTab('https://www.google.com');

  // Start API server
  startApiServer();

  // IPC handlers
  ipcMain.on('navigate', (_event, url: string) => {
    const tab = tabManager.getActiveTab();
    if (tab) {
      if (!/^https?:\/\//i.test(url)) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
      }
      tab.view.webContents.loadURL(url);
    }
  });

  ipcMain.on('go-back', () => {
    const tab = tabManager.getActiveTab();
    if (tab && tab.view.webContents.canGoBack()) {
      tab.view.webContents.goBack();
    }
  });

  ipcMain.on('go-forward', () => {
    const tab = tabManager.getActiveTab();
    if (tab && tab.view.webContents.canGoForward()) {
      tab.view.webContents.goForward();
    }
  });

  ipcMain.on('refresh', () => {
    const tab = tabManager.getActiveTab();
    if (tab) {
      tab.view.webContents.reload();
    }
  });

  ipcMain.on('new-tab', (_event, url?: string) => {
    tabManager.createTab(url || 'https://www.google.com');
  });

  ipcMain.on('close-tab', (_event, id: string) => {
    tabManager.closeTab(id);
  });

  ipcMain.on('activate-tab', (_event, id: string) => {
    tabManager.activateTab(id);
  });

  ipcMain.on('toggle-settings', () => {
    tabManager.toggleSettings();
  });

  ipcMain.handle('get-api-key', () => {
    return getApiKey();
  });
});

app.on('window-all-closed', () => {
  stopApiServer();
  app.quit();
});
