import { app, ipcMain } from 'electron';

app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
import { createMainWindow, getControlPlaneView } from './window';
import * as tabManager from './tab-manager';
import { startApiServer, stopApiServer } from './api-server';
import { getApiKey } from './auth';
import { listActivities, subscribe as subscribeActivities } from './activity-log';
import { listTasks, enqueueTask, subscribe as subscribeTasks } from './task-manager';
import { getTunnelState, startTunnel, stopTunnel, subscribe as subscribeTunnel } from './tunnel-manager';

function broadcastControlPlaneState(): void {
  const state = {
    tasks: listTasks().slice(0, 10),
    activities: listActivities(25),
    tunnel: getTunnelState(),
    api: {
      localUrl: 'http://127.0.0.1:3000',
      apiKey: getApiKey(),
    },
    activePage: tabManager.getActivePageState(),
  };

  getControlPlaneView()?.webContents.send('control-plane-state', state);
}

app.whenReady().then(() => {
  createMainWindow();

  // Create default tab
  tabManager.createTab('https://www.google.com');

  // Start API server
  startApiServer();
  subscribeTasks(broadcastControlPlaneState);
  subscribeActivities(broadcastControlPlaneState);
  subscribeTunnel(broadcastControlPlaneState);
  broadcastControlPlaneState();

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

  ipcMain.on('toggle-control-plane', () => {
    tabManager.toggleControlPlane();
    broadcastControlPlaneState();
  });

  ipcMain.on('toggle-sidebar', () => {
    tabManager.toggleSidebar();
  });

  ipcMain.handle('get-browser-state', () => {
    return {
      tabs: tabManager.listTabs(),
      activePage: tabManager.getActivePageState(),
      controlPlaneOpen: tabManager.isControlPlaneOpen(),
      sidebarOpen: tabManager.isSidebarOpen(),
    };
  });

  ipcMain.handle('get-control-plane-state', () => {
    return {
      tasks: listTasks().slice(0, 10),
      activities: listActivities(25),
      tunnel: getTunnelState(),
      api: {
        localUrl: 'http://127.0.0.1:3000',
        apiKey: getApiKey(),
      },
      activePage: tabManager.getActivePageState(),
    };
  });

  ipcMain.handle('submit-task', (_event, prompt: string) => {
    const task = enqueueTask(prompt);
    broadcastControlPlaneState();
    return task;
  });

  ipcMain.handle('start-tunnel', () => {
    startTunnel('http://127.0.0.1:3000');
    broadcastControlPlaneState();
  });

  ipcMain.handle('stop-tunnel', () => {
    stopTunnel();
    broadcastControlPlaneState();
  });
});

app.on('window-all-closed', () => {
  stopApiServer();
  app.quit();
});
