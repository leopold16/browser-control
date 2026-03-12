import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type ActivityKind = 'action' | 'task' | 'system' | 'tunnel';

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  label: string;
  detail?: string;
  timestamp: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const MAX_ENTRIES = 150;

let entries: ActivityEntry[] | null = null;
let nextActivityId = 1;

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'activity-log.json');
}

function loadEntries(): ActivityEntry[] {
  if (entries) return entries;

  try {
    const raw = fs.readFileSync(getLogPath(), 'utf-8');
    entries = JSON.parse(raw) as ActivityEntry[];
  } catch {
    entries = [];
  }

  for (const entry of entries) {
    const numericId = Number(entry.id.replace(/^activity-/, ''));
    if (Number.isFinite(numericId)) {
      nextActivityId = Math.max(nextActivityId, numericId + 1);
    }
  }

  return entries;
}

function persist(): void {
  fs.writeFileSync(getLogPath(), JSON.stringify(loadEntries(), null, 2));
}

function emitChange(): void {
  persist();
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function logActivity(kind: ActivityKind, label: string, detail?: string): ActivityEntry {
  const entry: ActivityEntry = {
    id: `activity-${nextActivityId++}`,
    kind,
    label,
    detail,
    timestamp: new Date().toISOString(),
  };

  loadEntries().unshift(entry);
  if (loadEntries().length > MAX_ENTRIES) {
    loadEntries().length = MAX_ENTRIES;
  }

  emitChange();
  return entry;
}

export function listActivities(limit: number = 40): ActivityEntry[] {
  return loadEntries().slice(0, limit);
}
