type ControlPlaneState = {
  api: {
    localUrl: string;
    apiKey: string;
  };
  activePage: {
    url: string;
    title: string;
  } | null;
  tunnel: {
    status: string;
    publicUrl?: string;
    error?: string;
  };
  activities: Array<{
    id: string;
    kind: string;
    label: string;
    detail?: string;
    timestamp: string;
  }>;
  tasks: Array<{
    id: string;
    prompt: string;
    status: string;
    summary?: string;
    error?: string;
    steps: Array<{ id: string; message: string }>;
  }>;
};

const controlApi = (window as any).browserAPI as {
  getControlPlaneState: () => Promise<ControlPlaneState>;
  submitTask: (prompt: string) => Promise<any>;
  startTunnel: () => Promise<void>;
  stopTunnel: () => Promise<void>;
  toggleControlPlane: () => void;
  onPageState: (
    callback: (state: {
      url: string;
      title: string;
      loading: boolean;
      canGoBack: boolean;
      canGoForward: boolean;
    } | null) => void
  ) => void;
  onControlPlaneState: (callback: (state: ControlPlaneState) => void) => void;
};

const closeBtn = document.getElementById('close-btn')!;
const tunnelStatusEl = document.getElementById('tunnel-status')!;
const tunnelActionBtn = document.getElementById('tunnel-action-btn') as HTMLButtonElement;
const connectUrlEl = document.getElementById('connect-url')!;
const connectUrlBlock = document.getElementById('connect-url-block')!;
const keyToggle = document.getElementById('key-toggle')!;
const keyValueEl = document.getElementById('key-value')!;
const copyCredsBtn = document.getElementById('copy-creds-btn') as HTMLButtonElement;
const copyDocsBtn = document.getElementById('copy-docs-btn') as HTMLButtonElement;
const copyMcpBtn = document.getElementById('copy-mcp-btn') as HTMLButtonElement;
const activitiesEl = document.getElementById('activity-list')!;

let latestState: ControlPlaneState | null = null;
let keyRevealed = false;

function copyText(value: string): void {
  navigator.clipboard.writeText(value);
}

function flashCopied(btn: HTMLButtonElement): void {
  btn.classList.add('copied');
  setTimeout(() => btn.classList.remove('copied'), 1200);
}

function getBaseUrl(state: ControlPlaneState): string {
  const tunnelRunning = state.tunnel.status === 'running' && state.tunnel.publicUrl;
  return tunnelRunning ? state.tunnel.publicUrl! : state.api.localUrl;
}

function buildCreds(state: ControlPlaneState): string {
  return [
    `BROWSER_CONTROL_URL=${getBaseUrl(state)}`,
    `BROWSER_CONTROL_API_KEY=${state.api.apiKey}`,
  ].join('\n');
}

function buildDocsPayload(state: ControlPlaneState): string {
  const url = getBaseUrl(state);
  const key = state.api.apiKey;
  return `# Browser Control API

Base URL: ${url}
API Key: ${key}
Auth: Authorization: Bearer ${key}

## Endpoints

GET  /state          Full browser state (tabs, page, tunnel)
GET  /snapshot       Accessibility tree (add ?full=true for nested)
GET  /screenshot     PNG of active tab
GET  /page           Structured: text fields, buttons, links, headings
POST /action         Execute action (see below)
GET  /tabs           List tabs
POST /tabs           New tab { "url": "..." }
DELETE /tabs/:id     Close tab
POST /tabs/:id/activate  Switch tab
GET  /history        Recent activity log

## Actions (POST /action)

{ "type": "click",    "ref": 7 }
{ "type": "type",     "ref": 3, "text": "hello" }
{ "type": "append",   "ref": 3, "text": " world" }
{ "type": "key",      "key": "Enter" }
{ "type": "select",   "ref": 12, "value": "Option" }
{ "type": "scroll",   "direction": "down" }
{ "type": "hover",    "ref": 5 }
{ "type": "navigate", "url": "https://example.com" }
{ "type": "back" }
{ "type": "forward" }
{ "type": "refresh" }
{ "type": "wait",     "ms": 2000 }
{ "type": "done",     "result": "summary" }

## How it works

1. GET /snapshot → see every interactive element with ref IDs
2. Pick an action based on the snapshot
3. POST /action → execute it
4. Repeat

Refs are per-snapshot. Take a new snapshot after page changes.
Snapshot nodes have: ref, role, name, value?, placeholder?, checked?, disabled?
GET /page returns pre-extracted textFields, buttons, links, headings.
`;
}

function buildMcpConfig(state: ControlPlaneState): string {
  const tunnelRunning = state.tunnel.status === 'running' && state.tunnel.publicUrl;

  if (tunnelRunning) {
    return JSON.stringify({
      mcpServers: {
        'browser-control': {
          url: `${state.tunnel.publicUrl}/mcp`,
          headers: {
            Authorization: `Bearer ${state.api.apiKey}`,
          },
        },
      },
    }, null, 2);
  }

  // Local: use npx mcp-remote as a stdio bridge since Claude Desktop
  // can't connect to local HTTP servers directly
  return JSON.stringify({
    mcpServers: {
      'browser-control': {
        command: 'npx',
        args: [
          'mcp-remote',
          `${state.api.localUrl}/mcp`,
          `--header',
          'Authorization: Bearer ${state.api.apiKey}`,
        ],
      },
    },
  }, null, 2);
}

function renderConnect(state: ControlPlaneState): void {
  const tunnelRunning = state.tunnel.status === 'running' && state.tunnel.publicUrl;

  tunnelStatusEl.textContent = tunnelRunning ? 'tunnel' : 'local';
  tunnelStatusEl.className = tunnelRunning ? 'pill pill-running' : 'pill pill-stopped';
  tunnelActionBtn.textContent = state.tunnel.status === 'running' || state.tunnel.status === 'starting'
    ? 'Stop' : 'Start tunnel';

  connectUrlEl.textContent = getBaseUrl(state);
  keyValueEl.textContent = state.api.apiKey;
}

function renderActivities(
  activities: Array<{ id: string; label: string; detail?: string; timestamp: string; kind: string }>
): void {
  activitiesEl.replaceChildren();

  if (activities.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No activity yet';
    activitiesEl.appendChild(empty);
    return;
  }

  const shown = activities.slice(0, 20);
  for (const a of shown) {
    const row = document.createElement('div');
    row.className = 'activity-row';

    const kind = document.createElement('span');
    kind.className = 'activity-kind';
    kind.textContent = a.kind;

    const text = document.createElement('span');
    text.className = 'activity-text';
    text.textContent = a.detail || a.label;

    row.appendChild(kind);
    row.appendChild(text);
    activitiesEl.appendChild(row);
  }
}

function renderState(state: ControlPlaneState): void {
  latestState = state;
  renderConnect(state);
  renderActivities(state.activities);
}

closeBtn.addEventListener('click', () => controlApi.toggleControlPlane());

keyToggle.addEventListener('click', () => {
  keyRevealed = !keyRevealed;
  keyValueEl.classList.toggle('visible', keyRevealed);
  keyToggle.classList.toggle('open', keyRevealed);
});

connectUrlBlock.addEventListener('click', () => {
  if (!latestState) return;
  copyText(getBaseUrl(latestState));
  flashCopied(copyCredsBtn);
});

copyCredsBtn.addEventListener('click', () => {
  if (!latestState) return;
  copyText(buildCreds(latestState));
  flashCopied(copyCredsBtn);
});

copyDocsBtn.addEventListener('click', () => {
  if (!latestState) return;
  copyText(buildDocsPayload(latestState));
  flashCopied(copyDocsBtn);
});

copyMcpBtn.addEventListener('click', () => {
  if (!latestState) return;
  copyText(buildMcpConfig(latestState));
  flashCopied(copyMcpBtn);
});

tunnelActionBtn.addEventListener('click', async () => {
  if (latestState?.tunnel.status === 'running' || latestState?.tunnel.status === 'starting') {
    await controlApi.stopTunnel();
  } else {
    await controlApi.startTunnel();
  }
});

controlApi.onControlPlaneState((state) => renderState(state));
controlApi.onPageState(() => {});
controlApi.getControlPlaneState().then((state) => renderState(state));
