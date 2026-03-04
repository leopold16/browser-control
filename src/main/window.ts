import { BaseWindow, WebContentsView } from 'electron';
import * as path from 'path';
import * as tabManager from './tab-manager';

let mainWindow: BaseWindow | null = null;
let chromeView: WebContentsView | null = null;
let settingsView: WebContentsView | null = null;

const CHROME_HEIGHT = 78;

export function createMainWindow(): {
  window: BaseWindow;
  chromeView: WebContentsView;
  settingsView: WebContentsView;
} {
  mainWindow = new BaseWindow({
    width: 1280,
    height: 900,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
  });

  // Chrome UI view
  chromeView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.contentView.addChildView(chromeView);

  const bounds = mainWindow.getBounds();
  chromeView.setBounds({
    x: 0,
    y: 0,
    width: bounds.width,
    height: CHROME_HEIGHT,
  });

  chromeView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Settings side panel view
  settingsView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.contentView.addChildView(settingsView);
  settingsView.setVisible(false);
  settingsView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  // Initialize tab manager
  tabManager.init(mainWindow, chromeView);
  tabManager.setSettingsView(settingsView);

  // Handle resize
  mainWindow.on('resize', () => {
    tabManager.updateAllBounds();
  });

  return { window: mainWindow, chromeView, settingsView };
}

export function getMainWindow(): BaseWindow | null {
  return mainWindow;
}

export function getChromeView(): WebContentsView | null {
  return chromeView;
}

export function getSettingsView(): WebContentsView | null {
  return settingsView;
}
