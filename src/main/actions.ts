import { WebContents } from 'electron';
import { cdpSend } from './cdp';
import { getRefMap } from './snapshot';
import { logActivity } from './activity-log';
import * as tabManager from './tab-manager';

interface ActionResult {
  ok: boolean;
  error?: string;
  result?: string;
}

function resolveRef(webContents: WebContents, ref: number): number {
  const refMap = getRefMap(webContents);
  const backendNodeId = refMap.get(ref);
  if (!backendNodeId) {
    throw new Error(`Element ref ${ref} not found — page may have changed, take a new snapshot`);
  }
  return backendNodeId;
}

async function resolveNode(webContents: WebContents, ref: number): Promise<{ nodeId: number }> {
  const backendNodeId = resolveRef(webContents, ref);
  const { nodeIds } = await cdpSend(webContents, 'DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId],
  });
  return { nodeId: nodeIds[0] };
}

async function getRemoteObject(webContents: WebContents, ref: number): Promise<string> {
  const backendNodeId = resolveRef(webContents, ref);
  const { object } = await cdpSend(webContents, 'DOM.resolveNode', {
    backendNodeId,
  });
  return object.objectId;
}

async function getBoxCenter(
  webContents: WebContents,
  backendNodeId: number
): Promise<{ x: number; y: number }> {
  // Ensure DOM domain is enabled
  await cdpSend(webContents, 'DOM.getDocument');

  const { nodeIds } = await cdpSend(webContents, 'DOM.pushNodesByBackendIdsToFrontend', {
    backendNodeIds: [backendNodeId],
  });
  const nodeId = nodeIds[0];

  // Scroll into view
  try {
    await cdpSend(webContents, 'DOM.scrollIntoViewIfNeeded', { nodeId });
  } catch {
    // Some nodes don't support scroll, that's fine
  }

  const { model } = await cdpSend(webContents, 'DOM.getBoxModel', { nodeId });
  // content quad: [x1,y1, x2,y2, x3,y3, x4,y4]
  const quad = model.content;
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  return { x, y };
}

function escapeForTemplate(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

async function showInteractionOverlay(
  webContents: WebContents,
  x: number,
  y: number,
  label: string
): Promise<void> {
  const safeLabel = escapeForTemplate(label);
  await webContents
    .executeJavaScript(
      `(() => {
        const overlayId = '__browser_control_overlay__';
        let root = document.getElementById(overlayId);
        if (!root) {
          root = document.createElement('div');
          root.id = overlayId;
          root.style.position = 'fixed';
          root.style.left = '0';
          root.style.top = '0';
          root.style.width = '0';
          root.style.height = '0';
          root.style.zIndex = '2147483647';
          root.style.pointerEvents = 'none';
          document.documentElement.appendChild(root);
        }

        const pulse = document.createElement('div');
        pulse.style.position = 'fixed';
        pulse.style.left = '${x}px';
        pulse.style.top = '${y}px';
        pulse.style.transform = 'translate(-50%, -50%)';
        pulse.style.width = '18px';
        pulse.style.height = '18px';
        pulse.style.borderRadius = '999px';
        pulse.style.border = '2px solid rgba(96, 165, 250, 0.95)';
        pulse.style.boxShadow = '0 0 0 10px rgba(96, 165, 250, 0.18)';
        pulse.style.background = 'rgba(15, 23, 42, 0.9)';
        pulse.style.transition = 'all 260ms ease';

        const tag = document.createElement('div');
        tag.textContent = '${safeLabel}';
        tag.style.position = 'fixed';
        tag.style.left = '${x + 14}px';
        tag.style.top = '${y + 14}px';
        tag.style.padding = '5px 8px';
        tag.style.borderRadius = '999px';
        tag.style.background = 'rgba(15, 23, 42, 0.92)';
        tag.style.color = '#f8fafc';
        tag.style.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        tag.style.border = '1px solid rgba(148, 163, 184, 0.25)';
        tag.style.transition = 'opacity 260ms ease';

        root.appendChild(pulse);
        root.appendChild(tag);
        requestAnimationFrame(() => {
          pulse.style.width = '34px';
          pulse.style.height = '34px';
          pulse.style.opacity = '0';
          pulse.style.boxShadow = '0 0 0 18px rgba(96, 165, 250, 0)';
          tag.style.opacity = '0';
        });

        setTimeout(() => {
          pulse.remove();
          tag.remove();
        }, 420);
      })();`,
      true
    )
    .catch(() => {});
}

async function setElementValue(
  webContents: WebContents,
  objectId: string,
  text: string,
  append: boolean
): Promise<void> {
  const nextValue = JSON.stringify(text);
  await cdpSend(webContents, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      const incomingValue = ${nextValue};
      const element = this;
      element.focus();

      if (element.isContentEditable) {
        const currentValue = element.innerText || '';
        element.innerText = ${append ? 'currentValue + incomingValue' : 'incomingValue'};
        element.dispatchEvent(new InputEvent('input', { bubbles: true, data: incomingValue, inputType: 'insertText' }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      const currentValue = typeof element.value === 'string' ? element.value : '';
      const finalValue = ${append ? 'currentValue + incomingValue' : 'incomingValue'};
      const proto =
        element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, finalValue);
      } else {
        element.value = finalValue;
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }`,
  });
}

async function clickAction(webContents: WebContents, ref: number): Promise<ActionResult> {
  const backendNodeId = resolveRef(webContents, ref);
  const { x, y } = await getBoxCenter(webContents, backendNodeId);
  await showInteractionOverlay(webContents, x, y, `Click ${ref}`);

  await cdpSend(webContents, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await cdpSend(webContents, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  return { ok: true };
}

async function typeAction(webContents: WebContents, ref: number, text: string): Promise<ActionResult> {
  const backendNodeId = resolveRef(webContents, ref);
  const { x, y } = await getBoxCenter(webContents, backendNodeId);
  const objectId = await getRemoteObject(webContents, ref);
  await showInteractionOverlay(webContents, x, y, `Type ${ref}`);

  // Focus the element
  await cdpSend(webContents, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.focus(); }',
  });

  try {
    await setElementValue(webContents, objectId, text, false);
  } catch {
    // Fall back to browser-level typing if synthetic events were insufficient.
    await cdpSend(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      modifiers: 4,
    });
    await cdpSend(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      modifiers: 4,
    });
    await cdpSend(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace',
    });
    await cdpSend(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
    });
    await cdpSend(webContents, 'Input.insertText', { text });
  }

  return { ok: true };
}

async function appendAction(webContents: WebContents, ref: number, text: string): Promise<ActionResult> {
  const backendNodeId = resolveRef(webContents, ref);
  const { x, y } = await getBoxCenter(webContents, backendNodeId);
  const objectId = await getRemoteObject(webContents, ref);
  await showInteractionOverlay(webContents, x, y, `Append ${ref}`);

  // Focus without clearing
  await cdpSend(webContents, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.focus(); }',
  });

  try {
    await setElementValue(webContents, objectId, text, true);
  } catch {
    await cdpSend(webContents, 'Input.insertText', { text });
  }
  return { ok: true };
}

function parseKeyCombo(key: string): { key: string; code: string; modifiers: number } {
  const parts = key.split('+');
  let modifiers = 0;
  let mainKey = parts[parts.length - 1];

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i].toLowerCase();
    if (mod === 'meta' || mod === 'cmd' || mod === 'command') modifiers |= 4;
    else if (mod === 'ctrl' || mod === 'control') modifiers |= 2;
    else if (mod === 'shift') modifiers |= 8;
    else if (mod === 'alt' || mod === 'option') modifiers |= 1;
  }

  // Map common key names to codes
  const keyCodeMap: Record<string, string> = {
    Enter: 'Enter',
    Tab: 'Tab',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Space: 'Space',
    ' ': 'Space',
  };

  const code = keyCodeMap[mainKey] || `Key${mainKey.toUpperCase()}`;
  if (mainKey === 'Space' || mainKey === ' ') mainKey = ' ';

  return { key: mainKey, code, modifiers };
}

async function keyAction(webContents: WebContents, key: string): Promise<ActionResult> {
  const { key: keyName, code, modifiers } = parseKeyCombo(key);

  await cdpSend(webContents, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: keyName,
    code,
    modifiers,
  });
  await cdpSend(webContents, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyName,
    code,
    modifiers,
  });

  return { ok: true };
}

async function selectAction(webContents: WebContents, ref: number, value: string): Promise<ActionResult> {
  const objectId = await getRemoteObject(webContents, ref);

  await cdpSend(webContents, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      this.focus();
      // Try matching by value first, then by text content
      for (const opt of this.options) {
        if (opt.value === '${value.replace(/'/g, "\\'")}' || opt.textContent.trim() === '${value.replace(/'/g, "\\'")}') {
          this.value = opt.value;
          this.dispatchEvent(new Event('input', { bubbles: true }));
          this.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      return false;
    }`,
  });

  return { ok: true };
}

async function scrollAction(webContents: WebContents, direction: string): Promise<ActionResult> {
  const deltaMap: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -300 },
    down: { x: 0, y: 300 },
    left: { x: -300, y: 0 },
    right: { x: 300, y: 0 },
  };

  const delta = deltaMap[direction];
  if (!delta) {
    return { ok: false, error: `Invalid scroll direction: ${direction}` };
  }

  await webContents.executeJavaScript(`window.scrollBy(${delta.x}, ${delta.y})`);
  return { ok: true };
}

async function hoverAction(webContents: WebContents, ref: number): Promise<ActionResult> {
  const backendNodeId = resolveRef(webContents, ref);
  const { x, y } = await getBoxCenter(webContents, backendNodeId);
  await showInteractionOverlay(webContents, x, y, `Hover ${ref}`);

  await cdpSend(webContents, 'Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  });

  return { ok: true };
}

export async function executeAction(action: any): Promise<ActionResult> {
  try {
    logActivity('action', `Action ${action.type}`, action.ref ? `ref ${action.ref}` : action.url || action.key);

    // Actions that don't need a tab's webContents
    if (action.type === 'wait') {
      await new Promise((resolve) => setTimeout(resolve, action.ms || 1000));
      return { ok: true };
    }

    if (action.type === 'done') {
      return { ok: true, result: action.result || 'Done' };
    }

    // Get active tab
    const tab = action.tabId ? tabManager.getTab(action.tabId) : tabManager.getActiveTab();
    if (!tab) {
      return { ok: false, error: 'No active tab' };
    }
    const webContents = tab.view.webContents;

    // Ensure DOM is available
    await cdpSend(webContents, 'DOM.getDocument');

    switch (action.type) {
      case 'click':
        return await clickAction(webContents, action.ref);
      case 'type':
        return await typeAction(webContents, action.ref, action.text);
      case 'append':
        return await appendAction(webContents, action.ref, action.text);
      case 'key':
        return await keyAction(webContents, action.key);
      case 'select':
        return await selectAction(webContents, action.ref, action.value);
      case 'scroll':
        return await scrollAction(webContents, action.direction);
      case 'hover':
        return await hoverAction(webContents, action.ref);
      case 'navigate':
        await webContents.loadURL(action.url);
        return { ok: true };
      case 'back':
        webContents.goBack();
        return { ok: true };
      case 'forward':
        webContents.goForward();
        return { ok: true };
      case 'refresh':
        webContents.reload();
        return { ok: true };
      default:
        return { ok: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (e: any) {
    return { ok: false, error: e.message || String(e) };
  }
}
