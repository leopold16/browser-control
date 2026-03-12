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
const connectBlockEl = document.getElementById('connect-block')!;
const copyConnectBtn = document.getElementById('copy-connect-btn') as HTMLButtonElement;
const pageTitleEl = document.getElementById('active-page-title')!;
const pageUrlEl = document.getElementById('active-page-url')!;
const activitiesEl = document.getElementById('activity-list')!;
const tasksEl = document.getElementById('task-list')!;

let latestState: ControlPlaneState | null = null;

function copyText(value: string): void {
  navigator.clipboard.writeText(value);
}

function buildConnectCommand(state: ControlPlaneState): string {
  const tunnelRunning = state.tunnel.status === 'running' && state.tunnel.publicUrl;
  const baseUrl = tunnelRunning ? state.tunnel.publicUrl! : state.api.localUrl;

  return [
    `BROWSER_CONTROL_URL=${baseUrl}`,
    `BROWSER_CONTROL_API_KEY=${state.api.apiKey}`,
  ].join('\n');
}

function renderConnectBlock(state: ControlPlaneState): void {
  const tunnelRunning = state.tunnel.status === 'running' && state.tunnel.publicUrl;

  tunnelStatusEl.textContent = tunnelRunning ? 'tunnel' : 'local';
  tunnelStatusEl.className = tunnelRunning ? 'pill pill-running' : 'pill pill-stopped';
  tunnelActionBtn.textContent = state.tunnel.status === 'running' || state.tunnel.status === 'starting'
    ? 'Stop tunnel'
    : 'Start tunnel';

  connectBlockEl.textContent = buildConnectCommand(state);
}

function renderActivities(
  activities: Array<{ id: string; label: string; detail?: string; timestamp: string; kind: string }>
): void {
  activitiesEl.replaceChildren();

  if (activities.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No recent actions yet.';
    activitiesEl.appendChild(empty);
    return;
  }

  for (const activity of activities) {
    const card = document.createElement('div');
    card.className = 'log-card';

    const label = document.createElement('div');
    label.className = 'log-title';
    label.textContent = activity.label;

    const detail = document.createElement('div');
    detail.className = 'log-detail';
    detail.textContent = activity.detail || activity.kind;

    card.appendChild(label);
    card.appendChild(detail);
    activitiesEl.appendChild(card);
  }
}

function renderTasks(tasks: ControlPlaneState['tasks']): void {
  tasksEl.replaceChildren();

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Queued and completed tasks will show up here.';
    tasksEl.appendChild(empty);
    return;
  }

  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task-card';

    const header = document.createElement('div');
    header.className = 'task-header';

    const title = document.createElement('div');
    title.className = 'task-prompt';
    title.textContent = task.prompt;

    const badge = document.createElement('span');
    badge.className = `task-status status-${task.status}`;
    badge.textContent = task.status;

    const summary = document.createElement('div');
    summary.className = 'task-summary';
    summary.textContent = task.summary || task.error || task.steps.at(-1)?.message || 'Waiting to run…';

    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);
    card.appendChild(summary);
    tasksEl.appendChild(card);
  }
}

function renderState(state: ControlPlaneState): void {
  latestState = state;

  pageTitleEl.textContent = state.activePage?.title || 'No page selected';
  pageUrlEl.textContent = state.activePage?.url || 'Open a page to start working';

  renderConnectBlock(state);
  renderActivities(state.activities);
  renderTasks(state.tasks);
}

closeBtn.addEventListener('click', () => controlApi.toggleControlPlane());

copyConnectBtn.addEventListener('click', () => {
  if (!latestState) return;
  copyText(buildConnectCommand(latestState));
  copyConnectBtn.classList.add('copied');
  setTimeout(() => copyConnectBtn.classList.remove('copied'), 1500);
});

tunnelActionBtn.addEventListener('click', async () => {
  if (latestState?.tunnel.status === 'running' || latestState?.tunnel.status === 'starting') {
    await controlApi.stopTunnel();
  } else {
    await controlApi.startTunnel();
  }
});

controlApi.onControlPlaneState((state) => renderState(state));
controlApi.onPageState((state) => {
  pageTitleEl.textContent = state?.title || 'No page selected';
  pageUrlEl.textContent = state?.url || 'Open a page to start working';
});
controlApi.getControlPlaneState().then((state) => renderState(state));
