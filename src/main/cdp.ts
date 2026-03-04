import { WebContents } from 'electron';

const attached = new WeakSet<WebContents>();

export async function attachDebugger(webContents: WebContents): Promise<void> {
  if (attached.has(webContents)) return;
  try {
    webContents.debugger.attach('1.3');
    attached.add(webContents);
    webContents.debugger.on('detach', () => {
      attached.delete(webContents);
    });
  } catch (e: any) {
    if (!e.message?.includes('Already attached')) throw e;
    attached.add(webContents);
  }
}

export async function cdpSend(
  webContents: WebContents,
  method: string,
  params: Record<string, any> = {}
): Promise<any> {
  await attachDebugger(webContents);
  return webContents.debugger.sendCommand(method, params);
}
