# browser-control

An Electron browser with a local REST API for LLM control. You use it as a normal browser — log into your tools, browse around. Behind the scenes, an LLM can see and interact with the page via the API.

## How it works

```
1. GET /snapshot   →  LLM sees every interactive element on the page (accessibility tree)
2. LLM picks action  →  click, type, navigate, scroll, ...
3. POST /action    →  action executes in the browser
4. repeat
```

The browser stays logged in to whatever you've signed into. The API is `localhost`-only and key-gated.

## Setup

```bash
npm install
npm start
```

Requires Node 18+ and macOS.

On first launch an API key is generated and shown in the settings panel (gear icon, top-right).

## API

Base URL: `http://localhost:3000`  
Auth header: `Authorization: Bearer <key>`

### GET /snapshot

Returns the accessibility tree of the current page — every interactive element with a stable `ref` ID.

```json
{
  "url": "https://kayak.com/flights",
  "title": "KAYAK – Flights",
  "tree": [
    { "ref": 3, "role": "combobox", "name": "From", "value": "" },
    { "ref": 4, "role": "combobox", "name": "To", "value": "" },
    { "ref": 7, "role": "button", "name": "Search" }
  ]
}
```

Add `?full=true` to get the complete nested tree including headings and static text.

### POST /action

```json
{ "type": "click",    "ref": 7 }
{ "type": "type",     "ref": 3, "text": "JFK" }
{ "type": "navigate", "url": "https://kayak.com" }
{ "type": "key",      "key": "Enter" }
{ "type": "select",   "ref": 12, "value": "Economy" }
{ "type": "scroll",   "direction": "down" }
{ "type": "wait",     "ms": 2000 }
{ "type": "done",     "result": "Task complete summary" }
```

Response: `{ "ok": true }` or `{ "ok": false, "error": "..." }`

### GET /screenshot

Returns a PNG of the current viewport. Useful when the snapshot isn't enough (charts, visual layout).

### Tab management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tabs` | List all open tabs |
| POST | `/tabs` | Open a new tab `{ "url": "..." }` |
| DELETE | `/tabs/:id` | Close a tab |
| POST | `/tabs/:id/activate` | Switch to a tab |

## LLM system prompt

```
You control a browser. Each turn you receive a snapshot of the current page
showing all interactive elements with ref IDs.

Respond with a JSON action to perform. Options:
  { "type": "click",    "ref": <id> }
  { "type": "type",     "ref": <id>, "text": "..." }
  { "type": "navigate", "url": "..." }
  { "type": "key",      "key": "Enter" }
  { "type": "select",   "ref": <id>, "value": "..." }
  { "type": "scroll",   "direction": "up" | "down" }
  { "type": "wait",     "ms": <number> }
  { "type": "done",     "result": "..." }

When the task is complete, respond with type "done" and a summary.

Current task: {user_task}
Current snapshot:
{snapshot}
```

## Project structure

```
src/
  main/
    index.ts          # app entry, IPC handlers
    window.ts         # BaseWindow + WebContentsView setup
    tab-manager.ts    # tab lifecycle, bounds, settings panel
    api-server.ts     # Express REST API
    auth.ts           # API key generation + persistence
    snapshot.ts       # accessibility tree builder
    actions.ts        # action executor
  preload/
    preload.ts        # context bridge (chrome ↔ main)
  renderer/
    index.html        # browser chrome UI
    renderer.ts       # chrome UI logic
    styles.css
    settings.html     # API settings side panel
    settings-renderer.ts
    settings.css
```
