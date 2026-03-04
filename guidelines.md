# Controllable Browser

An Electron app that is a browser. It has an API. An LLM controls it.

---

## What It Is

A Mac desktop app. User opens it, gets a browser. user can log in, use it as a regular browser.


Behind the scenes, a local API lets an LLM see and interact with the page.

it should serve as a combination for LLM based browser work. a browser that is logged in to your tools, that you can use. but that is locked in (LLM can only access that). That's it.

---

## API

`localhost:3000` — API key in header: `Authorization: Bearer <key>`

---

### GET /snapshot

The core endpoint. Returns the accessibility tree of the current page — every element the LLM can interact with, each with a stable `ref` ID.

**Response:**

```json
{
  "url": "https://kayak.com/flights",
  "title": "KAYAK – Flights",
  "tree": [
    { "ref": 1, "role": "link", "name": "Hotels" },
    { "ref": 2, "role": "link", "name": "Cars" },
    { "ref": 3, "role": "combobox", "name": "From", "value": "" },
    { "ref": 4, "role": "combobox", "name": "To", "value": "" },
    { "ref": 5, "role": "textbox", "name": "Depart", "value": "3/15/2026" },
    { "ref": 6, "role": "textbox", "name": "Return", "value": "" },
    { "ref": 7, "role": "button", "name": "Search" },
    { "ref": 8, "role": "checkbox", "name": "Direct flights only", "checked": false }
  ]
}
```

---

### POST /action

Single endpoint for all interactions. The LLM decides what to do based on the snapshot.

**Click:**
```json
{ "type": "click", "ref": 7 }
```

**Type:**
```json
{ "type": "type", "ref": 3, "text": "JFK" }
```

**Navigate:**
```json
{ "type": "navigate", "url": "https://kayak.com" }
```

**Key press:**
```json
{ "type": "key", "key": "Enter" }
```

**Select (dropdown):**
```json
{ "type": "select", "ref": 12, "value": "Economy" }
```

**Scroll:**
```json
{ "type": "scroll", "direction": "down" }
```

**Wait:**
```json
{ "type": "wait", "ms": 2000 }
```

**Response (all actions):**
```json
{ "ok": true }
```

**On error:**
```json
{ "ok": false, "error": "Element ref 7 not found — page may have changed, take a new snapshot" }
```

---

### GET /screenshot

Returns a PNG of the current viewport. Fallback for when the snapshot isn't enough (e.g., reading a chart, verifying visual layout).

**Response:** `image/png`

---

### GET /tabs

```json
[
  { "id": "1", "url": "https://kayak.com/flights", "title": "KAYAK – Flights", "active": true },
  { "id": "2", "url": "https://gmail.com", "title": "Inbox", "active": false }
]
```

### POST /tabs
```json
{ "url": "https://google.com" }
```

### DELETE /tabs/:id

Closes a tab.

### POST /tabs/:id/activate

Switches to a tab.

---

## LLM Control Loop

The entire integration:

```
1. GET /snapshot         → LLM sees the page structure
2. LLM decides action   → based on the task + snapshot
3. POST /action          → execute the action
4. goto 1
```

The LLM system prompt:

```
You control a browser. Each turn you receive a snapshot of the current page
showing all interactive elements with ref IDs.

Respond with a JSON action to perform. Options:
  { "type": "click", "ref": <id> }
  { "type": "type", "ref": <id>, "text": "..." }
  { "type": "navigate", "url": "..." }
  { "type": "key", "key": "Enter" }
  { "type": "select", "ref": <id>, "value": "..." }
  { "type": "scroll", "direction": "up" | "down" }
  { "type": "wait", "ms": <number> }
  { "type": "done", "result": "..." }

When the task is complete, respond with type "done" and a summary.

Current task: {user_task}
Current snapshot:
{snapshot}
```

### Example Turn

**Snapshot fed to LLM:**
```
url: https://kayak.com/flights
title: KAYAK – Flights

[3] combobox "From" value=""
[4] combobox "To" value=""
[5] textbox "Depart" value="3/15/2026"
[6] textbox "Return" value=""
[7] button "Search"
```

**LLM responds:**
```json
{ "type": "type", "ref": 3, "text": "JFK" }
```

Next snapshot shows updated state. LLM continues.

---

## Snapshot Format

Each node in the tree:

| Field | Type | Description |
|-------|------|-------------|
| `ref` | number | Stable ID for this element. Use in actions. |
| `role` | string | ARIA role: `button`, `link`, `textbox`, `combobox`, `checkbox`, `heading`, `listitem`, etc. |
| `name` | string | Accessible name (label text, button text, aria-label) |
| `value` | string? | Current value for inputs, textboxes, selects |
| `checked` | boolean? | For checkboxes and radio buttons |
| `selected` | boolean? | For options in selects |
| `disabled` | boolean? | Whether the element is disabled |
| `children` | node[]? | Nested elements (for complex structures like menus, lists) |

Flattened by default — only interactive elements. `?full=true` returns the complete nested tree including headings and static text (useful for reading page content).

---

## Action Types

| Type | Required Fields | Description |
|------|----------------|-------------|
| `click` | `ref` | Click an element |
| `type` | `ref`, `text` | Clear field and type text |
| `append` | `ref`, `text` | Type without clearing first |
| `navigate` | `url` | Go to URL |
| `key` | `key` | Key combo: `"Enter"`, `"Tab"`, `"Escape"`, `"ArrowDown"`, `"Meta+a"` |
| `select` | `ref`, `value` | Select dropdown option by value or visible text |
| `scroll` | `direction` | `"up"`, `"down"`, `"left"`, `"right"` |
| `wait` | `ms` | Wait N milliseconds |
| `hover` | `ref` | Hover over element |
| `back` | — | Browser back |
| `forward` | — | Browser forward |
| `refresh` | — | Reload page |
| `done` | `result` | Task complete, return summary |

---

## Auth

- API key generated on first launch
- Shown in app settings panel
- Required on every request: `Authorization: Bearer <key>`
- Everything `localhost` only by default

---

## MVP

1. Electron app with browser UI (url bar, tabs, back/forward)
2. `GET /snapshot` — accessibility tree with ref IDs
3. `POST /action` — click/type/navigate/key/scroll/wait
4. `GET /screenshot` — viewport PNG
5. API key auth
6. Settings panel showing key + URL