import { Router } from 'express';
import * as tabManager from './tab-manager';
import { listActivities } from './activity-log';
import { getSnapshot, type SnapshotNode } from './snapshot';
import { executeAction } from './actions';
import { enqueueTask, getRecentTaskSummaries, listTasks } from './task-manager';
import { getTunnelState, startTunnel, stopTunnel } from './tunnel-manager';

const router = Router();

// GET /snapshot
router.get('/snapshot', async (req, res) => {
  try {
    const tab = tabManager.getActiveTab();
    if (!tab) {
      res.status(400).json({ ok: false, error: 'No active tab' });
      return;
    }

    const full = req.query.full === 'true';
    const snapshot = await getSnapshot(tab.view.webContents, full);
    res.json(snapshot);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /action
router.post('/action', async (req, res) => {
  try {
    const result = await executeAction(req.body);
    if (result.ok) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/state', (_req, res) => {
  res.json({
    tabs: tabManager.listTabs(),
    activePage: tabManager.getActivePageState(),
    controlPlaneOpen: tabManager.isControlPlaneOpen(),
    activities: listActivities(25),
    tasks: listTasks().slice(0, 10),
    tunnel: getTunnelState(),
    authRequired: false,
  });
});

// GET /screenshot
router.get('/screenshot', async (req, res) => {
  try {
    const tab = tabManager.getActiveTab();
    if (!tab) {
      res.status(400).json({ ok: false, error: 'No active tab' });
      return;
    }

    const image = await tab.view.webContents.capturePage();
    const png = image.toPNG();
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /tabs
router.get('/tabs', (_req, res) => {
  res.json(tabManager.listTabs());
});

// POST /tabs
router.post('/tabs', (req, res) => {
  const url = req.body?.url || 'https://www.google.com';
  const tab = tabManager.createTab(url);
  res.json({ ok: true, id: tab.id });
});

// DELETE /tabs/:id
router.delete('/tabs/:id', (req, res) => {
  const success = tabManager.closeTab(req.params.id);
  if (success) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ ok: false, error: 'Tab not found' });
  }
});

// POST /tabs/:id/activate
router.post('/tabs/:id/activate', (req, res) => {
  const success = tabManager.activateTab(req.params.id);
  if (success) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ ok: false, error: 'Tab not found' });
  }
});

router.get('/history', (req, res) => {
  const limit = Number(req.query.limit || 6);
  res.json({
    tasks: getRecentTaskSummaries(Number.isFinite(limit) ? limit : 6),
    activities: listActivities(20),
  });
});

router.get('/tasks', (_req, res) => {
  res.json(listTasks());
});

router.post('/tasks', (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) {
    res.status(400).json({ ok: false, error: 'prompt is required' });
    return;
  }

  const task = enqueueTask(prompt);
  res.json({ ok: true, task });
});

// GET /page – smart endpoint: extracts text fields, buttons, links, headings
router.get('/page', async (_req, res) => {
  try {
    const tab = tabManager.getActiveTab();
    if (!tab) {
      res.status(400).json({ ok: false, error: 'No active tab' });
      return;
    }

    const snap = await getSnapshot(tab.view.webContents, true);
    const result: {
      url: string;
      title: string;
      textFields: Array<{ ref: number; role: string; name: string; value?: string; placeholder?: string }>;
      buttons: Array<{ ref: number; name: string; disabled?: boolean }>;
      links: Array<{ ref: number; name: string }>;
      headings: Array<{ name: string }>;
    } = {
      url: snap.url,
      title: snap.title,
      textFields: [],
      buttons: [],
      links: [],
      headings: [],
    };

    function walk(nodes: SnapshotNode[]) {
      for (const node of nodes) {
        if (['textbox', 'searchbox', 'textarea', 'combobox'].includes(node.role)) {
          result.textFields.push({
            ref: node.ref,
            role: node.role,
            name: node.name,
            value: node.value,
            placeholder: node.placeholder,
          });
        } else if (node.role === 'button' || node.role === 'menuitem') {
          result.buttons.push({ ref: node.ref, name: node.name, disabled: node.disabled });
        } else if (node.role === 'link') {
          result.links.push({ ref: node.ref, name: node.name });
        } else if (node.role === 'heading') {
          result.headings.push({ name: node.name });
        }
        if (node.children) walk(node.children);
      }
    }

    walk(snap.tree);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/tunnel/start', (_req, res) => {
  startTunnel('http://127.0.0.1:3000');
  res.json({ ok: true, tunnel: getTunnelState() });
});

router.post('/tunnel/stop', (_req, res) => {
  stopTunnel();
  res.json({ ok: true, tunnel: getTunnelState() });
});

export default router;
