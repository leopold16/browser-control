import { Router } from 'express';
import * as tabManager from './tab-manager';
import { getSnapshot } from './snapshot';
import { executeAction } from './actions';

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

export default router;
