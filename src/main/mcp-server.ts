import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response, Application } from 'express';
import { z } from 'zod';
import * as tabManager from './tab-manager';
import { getSnapshot, type SnapshotNode } from './snapshot';
import { executeAction } from './actions';
import { listActivities } from './activity-log';
import { listTasks } from './task-manager';
import { getTunnelState } from './tunnel-manager';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'browser-control',
    version: '1.0.0',
  });

  server.registerTool(
    'snapshot',
    {
      title: 'Page Snapshot',
      description:
        'Get the accessibility tree of the current page. Returns elements with ref IDs that can be used to target actions like click, type, etc.',
      inputSchema: {
        full: z
          .boolean()
          .optional()
          .describe('Return full nested tree instead of flat interactive-only list'),
      },
    },
    async ({ full }) => {
      const tab = tabManager.getActiveTab();
      if (!tab) {
        return { content: [{ type: 'text', text: 'Error: No active tab' }], isError: true };
      }
      const snapshot = await getSnapshot(tab.view.webContents, full ?? false);
      return { content: [{ type: 'text', text: JSON.stringify(snapshot, null, 2) }] };
    },
  );

  server.registerTool(
    'action',
    {
      title: 'Browser Action',
      description:
        'Execute a browser action. Use ref IDs from a snapshot to target elements. Always take a snapshot first to get current ref IDs.',
      inputSchema: {
        type: z.enum([
          'click',
          'type',
          'append',
          'key',
          'select',
          'scroll',
          'hover',
          'navigate',
          'back',
          'forward',
          'refresh',
          'wait',
          'done',
        ]),
        ref: z.number().optional().describe('Element ref ID from snapshot (for click, type, append, hover, select)'),
        text: z.string().optional().describe('Text to enter (for type, append)'),
        url: z.string().optional().describe('URL to load (for navigate)'),
        key: z.string().optional().describe('Key combo (for key action, e.g. "Enter", "Ctrl+a")'),
        direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Scroll direction'),
        value: z.string().optional().describe('Option value (for select)'),
        ms: z.number().optional().describe('Wait duration in ms (for wait, default 1000)'),
        tabId: z.string().optional().describe('Target a specific tab instead of the active one'),
      },
    },
    async (params) => {
      const result = await executeAction(params);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error || 'Action failed' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'screenshot',
    {
      title: 'Screenshot',
      description: 'Capture a PNG screenshot of the current page viewport.',
    },
    async () => {
      const tab = tabManager.getActiveTab();
      if (!tab) {
        return { content: [{ type: 'text', text: 'Error: No active tab' }], isError: true };
      }
      const image = await tab.view.webContents.capturePage();
      const png = image.toPNG();
      return {
        content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }],
      };
    },
  );

  server.registerTool(
    'state',
    {
      title: 'Browser State',
      description: 'Get current browser state: open tabs, active page URL/title, recent activities, and running tasks.',
    },
    async () => {
      const state = {
        tabs: tabManager.listTabs(),
        activePage: tabManager.getActivePageState(),
        activities: listActivities(25),
        tasks: listTasks().slice(0, 10),
        tunnel: getTunnelState(),
      };
      return { content: [{ type: 'text', text: JSON.stringify(state, null, 2) }] };
    },
  );

  server.registerTool(
    'page',
    {
      title: 'Structured Page Data',
      description:
        'Extract structured data from the current page: text fields, buttons, links, and headings with their ref IDs.',
    },
    async () => {
      const tab = tabManager.getActiveTab();
      if (!tab) {
        return { content: [{ type: 'text', text: 'Error: No active tab' }], isError: true };
      }

      const snap = await getSnapshot(tab.view.webContents, true);
      const result: Record<string, unknown[]> = {
        textFields: [],
        buttons: [],
        links: [],
        headings: [],
      };

      function walk(nodes: SnapshotNode[]) {
        for (const node of nodes) {
          if (['textbox', 'searchbox', 'textarea', 'combobox'].includes(node.role)) {
            (result.textFields as unknown[]).push({
              ref: node.ref,
              role: node.role,
              name: node.name,
              value: node.value,
              placeholder: node.placeholder,
            });
          } else if (node.role === 'button' || node.role === 'menuitem') {
            (result.buttons as unknown[]).push({ ref: node.ref, name: node.name, disabled: node.disabled });
          } else if (node.role === 'link') {
            (result.links as unknown[]).push({ ref: node.ref, name: node.name });
          } else if (node.role === 'heading') {
            (result.headings as unknown[]).push({ name: node.name });
          }
          if (node.children) walk(node.children);
        }
      }

      walk(snap.tree);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ url: snap.url, title: snap.title, ...result }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    'tab_create',
    {
      title: 'Create Tab',
      description: 'Open a new browser tab.',
      inputSchema: {
        url: z.string().optional().describe('URL to open (defaults to https://www.google.com)'),
      },
    },
    async ({ url }) => {
      const tab = tabManager.createTab(url || 'https://www.google.com');
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, id: tab.id }) }] };
    },
  );

  server.registerTool(
    'tab_close',
    {
      title: 'Close Tab',
      description: 'Close a browser tab by its ID.',
      inputSchema: {
        tabId: z.string().describe('ID of the tab to close'),
      },
    },
    async ({ tabId }) => {
      const success = tabManager.closeTab(tabId);
      if (!success) {
        return { content: [{ type: 'text', text: 'Error: Tab not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    },
  );

  server.registerTool(
    'tab_activate',
    {
      title: 'Activate Tab',
      description: 'Switch to a browser tab by its ID.',
      inputSchema: {
        tabId: z.string().describe('ID of the tab to switch to'),
      },
    },
    async ({ tabId }) => {
      const success = tabManager.activateTab(tabId);
      if (!success) {
        return { content: [{ type: 'text', text: 'Error: Tab not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    },
  );

  return server;
}

export function mountMcpRoutes(app: Application): void {
  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('MCP request error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  });

  console.log('MCP server mounted at /mcp');
}
