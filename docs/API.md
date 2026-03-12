# API Reference

Base URL: `http://127.0.0.1:3000` (local) or your Cloudflare tunnel URL.

## Authentication

Every request must include the API key as a Bearer token:

```
Authorization: Bearer <your-api-key>
```

The key is auto-generated on first launch and shown in the control plane sidebar. You can also find it in the app's config file (`config.json` in Electron's `userData` directory).

All examples below omit the header for brevity. In practice, always include it.

---

## GET /state

Full browser state in a single call. Useful for initial context.

**Response:**

```json
{
  "tabs": [
    { "id": "1", "url": "https://google.com", "title": "Google", "active": true, "loading": false },
    { "id": "2", "url": "https://github.com", "title": "GitHub", "active": false, "loading": false }
  ],
  "activePage": {
    "url": "https://google.com",
    "title": "Google",
    "loading": false,
    "canGoBack": false,
    "canGoForward": false
  },
  "controlPlaneOpen": true,
  "activities": [
    { "id": "activity-1", "kind": "action", "label": "Action navigate", "detail": "https://google.com", "timestamp": "..." }
  ],
  "tasks": [],
  "tunnel": { "status": "stopped", "localUrl": "http://127.0.0.1:3000" }
}
```

---

## GET /snapshot

Returns the accessibility tree of the active tab. Every interactive element gets a `ref` ID you can use with `/action`.

**Query parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `full` | `false` | `true` returns the complete nested tree (headings, paragraphs, etc). `false` returns only interactive elements in a flat list. |

**Response (flat mode):**

```json
{
  "url": "https://kayak.com/flights",
  "title": "KAYAK – Flights",
  "tree": [
    { "ref": 3, "role": "combobox", "name": "From", "value": "", "placeholder": "City or airport" },
    { "ref": 4, "role": "combobox", "name": "To", "value": "" },
    { "ref": 7, "role": "button", "name": "Search" },
    { "ref": 12, "role": "link", "name": "Hotels" }
  ]
}
```

**Node properties:**

| Field | Type | Description |
|-------|------|-------------|
| `ref` | number | Stable ID for this snapshot. Use with `/action`. |
| `role` | string | Accessibility role: `button`, `link`, `textbox`, `combobox`, `checkbox`, etc. |
| `name` | string | Accessible name (label text, button text, link text) |
| `value` | string? | Current value (for inputs, selects) |
| `placeholder` | string? | Placeholder text |
| `checked` | boolean? | Checkbox/radio state |
| `selected` | boolean? | Option selected state |
| `disabled` | boolean? | Whether the element is disabled |
| `readonly` | boolean? | Whether the element is read-only |
| `children` | node[]? | Child nodes (only in `full=true` mode) |

**Important:** Refs are valid only until the next snapshot. If the page changes (navigation, dynamic update), take a new snapshot to get fresh refs.

---

## POST /action

Execute an action in the browser. Send a JSON body with `type` and the relevant parameters.

**Response:** `{ "ok": true }` on success, `{ "ok": false, "error": "..." }` on failure.

All actions support an optional `tabId` field to target a specific tab instead of the active one.

### Actions

#### click

Click an element by ref.

```json
{ "type": "click", "ref": 7 }
```

Scrolls the element into view, dispatches mousedown + mouseup at its center.

#### type

Clear and type text into an input field.

```json
{ "type": "type", "ref": 3, "text": "JFK" }
```

Replaces the current value entirely. Triggers `input` and `change` events.

#### append

Append text to an input field without clearing it.

```json
{ "type": "append", "ref": 3, "text": " Airport" }
```

#### key

Send a keyboard shortcut or key press.

```json
{ "type": "key", "key": "Enter" }
{ "type": "key", "key": "Meta+a" }
{ "type": "key", "key": "Ctrl+Shift+k" }
```

Supported modifiers: `Meta`/`Cmd`, `Ctrl`, `Shift`, `Alt`/`Option`. Combine with `+`.

Common keys: `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`, `Space`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`.

#### select

Choose an option in a `<select>` dropdown.

```json
{ "type": "select", "ref": 12, "value": "Economy" }
```

Matches by option `value` first, then by visible text.

#### scroll

Scroll the page.

```json
{ "type": "scroll", "direction": "down" }
```

Directions: `up`, `down`, `left`, `right`. Scrolls ~300px per call.

#### hover

Hover over an element (triggers CSS `:hover` and mouseover events).

```json
{ "type": "hover", "ref": 5 }
```

#### navigate

Navigate to a URL.

```json
{ "type": "navigate", "url": "https://example.com" }
```

#### back / forward / refresh

Browser navigation.

```json
{ "type": "back" }
{ "type": "forward" }
{ "type": "refresh" }
```

#### wait

Pause for a duration (useful between actions on dynamic pages).

```json
{ "type": "wait", "ms": 2000 }
```

#### done

No-op action. Use as a signal that a task is complete.

```json
{ "type": "done", "result": "Found 3 flights under $500" }
```

Returns `{ "ok": true, "result": "Found 3 flights under $500" }`.

---

## GET /screenshot

Returns a PNG image of the active tab's viewport.

**Response:** `image/png` binary.

```bash
curl -H "Authorization: Bearer $KEY" http://127.0.0.1:3000/screenshot -o page.png
```

---

## GET /page

Smart endpoint that parses the full accessibility tree and returns structured lists of interactive elements. Useful when you need a quick overview without walking the raw tree.

**Response:**

```json
{
  "url": "https://example.com/login",
  "title": "Login - Example",
  "textFields": [
    { "ref": 5, "role": "textbox", "name": "Email", "value": "", "placeholder": "you@example.com" },
    { "ref": 8, "role": "textbox", "name": "Password", "value": "" }
  ],
  "buttons": [
    { "ref": 12, "name": "Sign in", "disabled": false },
    { "ref": 15, "name": "Forgot password?" }
  ],
  "links": [
    { "ref": 20, "name": "Create account" },
    { "ref": 22, "name": "Privacy Policy" }
  ],
  "headings": [
    { "name": "Welcome back" }
  ]
}
```

---

## Tab management

### GET /tabs

List all open tabs.

```json
[
  { "id": "1", "url": "https://google.com", "title": "Google", "active": true, "loading": false },
  { "id": "2", "url": "https://github.com", "title": "GitHub", "active": false, "loading": false }
]
```

### POST /tabs

Open a new tab. It becomes the active tab.

**Body:**

```json
{ "url": "https://example.com" }
```

Defaults to `https://www.google.com` if no URL is provided.

**Response:** `{ "ok": true, "id": "3" }`

### DELETE /tabs/:id

Close a tab. If it's the last tab, a new Google tab is created automatically.

**Response:** `{ "ok": true }` or 404.

### POST /tabs/:id/activate

Switch to a tab.

**Response:** `{ "ok": true }` or 404.

---

## History

### GET /history

Returns recent task summaries and activity log.

**Query parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `6` | Max task summaries to return |

**Response:**

```json
{
  "tasks": [
    { "prompt": "Find flights to NYC", "summary": "Found 5 options under $400", "status": "done" }
  ],
  "activities": [
    { "id": "activity-3", "kind": "action", "label": "Action click", "detail": "ref 7", "timestamp": "..." }
  ]
}
```

### GET /tasks

Returns all tasks (full records with steps).

### POST /tasks

Enqueue a task for tracking.

**Body:**

```json
{ "prompt": "Search for flights to NYC under $500" }
```

**Response:** `{ "ok": true, "task": { "id": "task-1", "prompt": "...", "status": "queued", ... } }`

---

## Tunnel

### POST /tunnel/start

Start a Cloudflare tunnel (requires `cloudflared` installed).

**Response:** `{ "ok": true, "tunnel": { "status": "starting", "localUrl": "http://127.0.0.1:3000" } }`

The tunnel status updates asynchronously. Poll `/state` or check the control plane to get the public URL once it's ready.

### POST /tunnel/stop

Stop the tunnel.

**Response:** `{ "ok": true, "tunnel": { "status": "stopped", ... } }`

---

## Example: fill a login form

```bash
export URL=http://127.0.0.1:3000
export KEY=your-api-key

# Navigate to the login page
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"type":"navigate","url":"https://example.com/login"}' $URL/action

# Wait for page to load
sleep 2

# See what's on the page
curl -H "Authorization: Bearer $KEY" $URL/page | python3 -m json.tool

# Type into the email field (ref from /page response)
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"type":"type","ref":5,"text":"user@example.com"}' $URL/action

# Type password
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"type":"type","ref":8,"text":"hunter2"}' $URL/action

# Click sign in
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"type":"click","ref":12}' $URL/action
```

## Example: read page content

```bash
# Get the full tree with text content
curl -H "Authorization: Bearer $KEY" "$URL/snapshot?full=true" | python3 -m json.tool

# Or use /page for a structured summary
curl -H "Authorization: Bearer $KEY" "$URL/page" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'Page: {data[\"title\"]}')
print(f'URL:  {data[\"url\"]}')
print(f'Text fields: {len(data[\"textFields\"])}')
print(f'Buttons: {len(data[\"buttons\"])}')
print(f'Links: {len(data[\"links\"])}')
for h in data['headings']:
    print(f'  # {h[\"name\"]}')
"
```

## Error handling

All endpoints return JSON errors:

```json
{ "ok": false, "error": "Element ref 42 not found — page may have changed, take a new snapshot" }
```

Common errors:

| Status | Meaning |
|--------|---------|
| 400 | Bad request (no active tab, invalid action, missing params) |
| 401 | Missing `Authorization: Bearer <key>` header |
| 403 | Invalid API key |
| 404 | Tab not found |
| 500 | Internal error (CDP failure, etc.) |

When a ref is stale (page changed since last snapshot), take a new snapshot with `GET /snapshot` and use the fresh refs.
