import { BaseWindow, WebContentsView } from 'electron';
import * as path from 'path';
import * as tabManager from './tab-manager';

let mainWindow: BaseWindow | null = null;
let toolbarView: WebContentsView | null = null;
let sidebarView: WebContentsView | null = null;
let controlPlaneView: WebContentsView | null = null;

export function createMainWindow(): {
  window: BaseWindow;
  toolbarView: WebContentsView;
  sidebarView: WebContentsView;
  controlPlaneView: WebContentsView;
} {
  mainWindow = new BaseWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#050508',
  });

  toolbarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  sidebarView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  controlPlaneView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.contentView.addChildView(toolbarView);
  mainWindow.contentView.addChildView(sidebarView);
  mainWindow.contentView.addChildView(controlPlaneView);

  toolbarView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'toolbar.html'));
  sidebarView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'sidebar.html'));
  controlPlaneView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'control-plane.html'));

  // Initialize tab manager
  tabManager.init(mainWindow, toolbarView, sidebarView);
  tabManager.setControlPlaneView(controlPlaneView);
  tabManager.updateAllBounds();

  // Handle resize
  mainWindow.on('resize', () => {
    tabManager.updateAllBounds();
  });

  return { window: mainWindow, toolbarView, sidebarView, controlPlaneView };
}

export function getMainWindow(): BaseWindow | null {
  return mainWindow;
}

export function getToolbarView(): WebContentsView | null {
  return toolbarView;
}

export function getSidebarView(): WebContentsView | null {
  return sidebarView;
}

export function getControlPlaneView(): WebContentsView | null {
  return controlPlaneView;
}
