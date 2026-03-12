# browser-control

A controllable Electron browser with a REST API. Use it as a normal browser — log into sites, browse around — while external tools interact with the page through the API.

No AI or LLM built in. The browser exposes endpoints for navigation, clicking, typing, screenshots, and reading the accessibility tree. Any tool (OpenClaw, Claude, custom scripts) can drive it.

## Setup

```bash
npm install
npm start
```

Requires Node 18+ and Electron 33+. macOS only (uses native traffic lights and `hiddenInset` title bar).

## How it works

The browser has three panels:

- **Sidebar** (left, toggleable) — open tabs, switch between them, create/close tabs
- **Toolbar** (top) — back/forward/refresh, URL bar, toggle buttons for both sidebars
- **Control plane** (right, toggleable) — current page info, connection block with API key, tunnel controls, activity log

On launch, an Express server starts on `http://127.0.0.1:3000` with all API routes. An API key is auto-generated on first run and persisted in `~/.config/browser-control/config.json` (or equivalent `userData` path). Every request requires `Authorization: Bearer <key>`.

The control plane shows a copyable connection block:

```
BROWSER_CONTROL_URL=http://127.0.0.1:3000
BROWSER_CONTROL_API_KEY=<your-key>
```

Start a Cloudflare tunnel from the control plane to get a public URL. The connection block switches automatically:

```
BROWSER_CONTROL_URL=https://xxx.trycloudflare.com
BROWSER_CONTROL_API_KEY=<your-key>
```

Copy and paste into your tool's config.

## API overview

See **[docs/API.md](docs/API.md)** for the full reference with examples.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/state` | Full browser state (tabs, active page, tunnel, activities) |
| GET | `/snapshot` | Accessibility tree of the active tab |
| GET | `/screenshot` | PNG screenshot of the active tab |
| GET | `/page` | Structured extract: text fields, buttons, links, headings |
| POST | `/action` | Execute a browser action (click, type, navigate, ...) |
| GET | `/tabs` | List open tabs |
| POST | `/tabs` | Open a new tab |
| DELETE | `/tabs/:id` | Close a tab |
| POST | `/tabs/:id/activate` | Switch to a tab |
| GET | `/history` | Recent task summaries and activity log |
| GET | `/tasks` | All tasks |
| POST | `/tasks` | Enqueue a task |
| POST | `/tunnel/start` | Start Cloudflare tunnel |
| POST | `/tunnel/stop` | Stop Cloudflare tunnel |

## Typical integration loop

```
1. GET /snapshot   →  tool sees every interactive element with ref IDs
2. tool decides    →  pick an action based on the snapshot
3. POST /action    →  execute it (click, type, navigate, ...)
4. repeat until done
```

## Project structure

```
src/
  main/
    index.ts            # app entry, IPC handlers
    window.ts           # BaseWindow + WebContentsView setup
    tab-manager.ts      # tab lifecycle, layout, sidebar toggling
    api-server.ts       # Express server on port 3000
    api-routes.ts       # all REST endpoints
    auth.ts             # auto-generated API key + Bearer middleware
    snapshot.ts         # accessibility tree builder (CDP)
    actions.ts          # action executor (click, type, scroll, ...)
    cdp.ts              # Chrome DevTools Protocol helpers
    activity-log.ts     # in-memory activity log
    task-manager.ts     # task queue + persistence
    tunnel-manager.ts   # Cloudflare tunnel (cloudflared)
  preload/
    preload.ts          # contextBridge (renderer ↔ main IPC)
  renderer/
    toolbar.html/css/ts     # top bar: nav, URL, sidebar toggles
    sidebar.html/css/ts     # left panel: tabs
    control-plane.html/css/ts  # right panel: connect, tunnel, history
```
