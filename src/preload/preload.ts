import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('browserAPI', {
  navigate: (url: string) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  refresh: () => ipcRenderer.send('refresh'),
  newTab: (url?: string) => ipcRenderer.send('new-tab', url),
  closeTab: (id: string) => ipcRenderer.send('close-tab', id),
  activateTab: (id: string) => ipcRenderer.send('activate-tab', id),
  toggleControlPlane: () => ipcRenderer.send('toggle-control-plane'),
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  getBrowserState: () => ipcRenderer.invoke('get-browser-state'),
  getControlPlaneState: () => ipcRenderer.invoke('get-control-plane-state'),
  submitTask: (prompt: string) => ipcRenderer.invoke('submit-task', prompt),
  startTunnel: () => ipcRenderer.invoke('start-tunnel'),
  stopTunnel: () => ipcRenderer.invoke('stop-tunnel'),

  onPageState: (
    callback: (state: {
      url: string;
      title: string;
      loading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    } | null) => void
  ) => {
    ipcRenderer.on('page-state', (_event, state) => callback(state));
  },
  onTabsChanged: (callback: (tabs: any[]) => void) => {
    ipcRenderer.on('tabs-changed', (_event, tabs) => callback(tabs));
  },
  onControlPlaneToggled: (callback: (open: boolean) => void) => {
    ipcRenderer.on('control-plane-toggled', (_event, open) => callback(open));
  },
  onControlPlaneState: (callback: (state: any) => void) => {
    ipcRenderer.on('control-plane-state', (_event, state) => callback(state));
  },
  onSidebarToggled: (callback: (open: boolean) => void) => {
    ipcRenderer.on('sidebar-toggled', (_event, open) => callback(open));
  },
});
