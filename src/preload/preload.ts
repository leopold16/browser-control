import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('browserAPI', {
  navigate: (url: string) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  refresh: () => ipcRenderer.send('refresh'),
  newTab: (url?: string) => ipcRenderer.send('new-tab', url),
  closeTab: (id: string) => ipcRenderer.send('close-tab', id),
  activateTab: (id: string) => ipcRenderer.send('activate-tab', id),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  toggleSettings: () => ipcRenderer.send('toggle-settings'),

  onUrlChanged: (callback: (url: string) => void) => {
    ipcRenderer.on('url-changed', (_event, url) => callback(url));
  },
  onTitleChanged: (callback: (title: string) => void) => {
    ipcRenderer.on('title-changed', (_event, title) => callback(title));
  },
  onTabsChanged: (callback: (tabs: any[]) => void) => {
    ipcRenderer.on('tabs-changed', (_event, tabs) => callback(tabs));
  },
  onLoading: (callback: (loading: boolean) => void) => {
    ipcRenderer.on('loading', (_event, loading) => callback(loading));
  },
  onSettingsToggled: (callback: (open: boolean) => void) => {
    ipcRenderer.on('settings-toggled', (_event, open) => callback(open));
  },
});
