import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { logActivity } from './activity-log';

export interface TunnelState {
  status: 'stopped' | 'starting' | 'running' | 'error';
  publicUrl?: string;
  localUrl: string;
  error?: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const TRY_CLOUDFLARE_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

let tunnelProcess: ChildProcessWithoutNullStreams | null = null;
let state: TunnelState = {
  status: 'stopped',
  localUrl: 'http://127.0.0.1:3000',
};

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<TunnelState>): void {
  state = { ...state, ...patch };
  emitChange();
}

function parseOutput(chunk: string): void {
  const match = chunk.match(TRY_CLOUDFLARE_PATTERN);
  if (!match) return;

  if (state.publicUrl !== match[0] || state.status !== 'running') {
    setState({ status: 'running', publicUrl: match[0], error: undefined });
    logActivity('tunnel', 'Tunnel online', match[0]);
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTunnelState(): TunnelState {
  return { ...state };
}

export function startTunnel(localUrl: string = state.localUrl): void {
  if (tunnelProcess) return;

  setState({ status: 'starting', localUrl, error: undefined, publicUrl: undefined });
  logActivity('tunnel', 'Starting Cloudflare tunnel', localUrl);

  try {
    tunnelProcess = spawn('cloudflared', ['tunnel', '--url', localUrl], {
      stdio: 'pipe',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tunnelProcess = null;
    setState({ status: 'error', error: message });
    logActivity('tunnel', 'Tunnel failed to start', message);
    return;
  }

  tunnelProcess.stdout.on('data', (chunk: Buffer) => {
    parseOutput(chunk.toString());
  });

  tunnelProcess.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    parseOutput(text);
    if (/not found|failed|error/i.test(text)) {
      setState({ status: 'error', error: text.trim() });
    }
  });

  tunnelProcess.on('error', (error) => {
    const message = error.message || String(error);
    tunnelProcess = null;
    setState({ status: 'error', error: message, publicUrl: undefined });
    logActivity('tunnel', 'Tunnel failed to start', message);
  });

  tunnelProcess.on('exit', (code) => {
    tunnelProcess = null;
    if (code === 0 || state.status === 'stopped') {
      setState({ status: 'stopped', publicUrl: undefined, error: undefined });
    } else {
      setState({
        status: 'error',
        publicUrl: undefined,
        error: state.error || `cloudflared exited with code ${code ?? 'unknown'}`,
      });
      logActivity('tunnel', 'Tunnel stopped unexpectedly', state.error);
    }
  });
}

export function stopTunnel(): void {
  if (!tunnelProcess) {
    setState({ status: 'stopped', publicUrl: undefined, error: undefined });
    return;
  }

  logActivity('tunnel', 'Stopping Cloudflare tunnel');
  setState({ status: 'stopped', publicUrl: undefined, error: undefined });
  tunnelProcess.kill();
  tunnelProcess = null;
}
