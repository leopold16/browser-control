import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

export interface TaskStep {
  id: string;
  message: string;
  timestamp: string;
}

export interface TaskRecord {
  id: string;
  prompt: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  summary?: string;
  error?: string;
  steps: TaskStep[];
}

interface TaskStoreShape {
  tasks: TaskRecord[];
}

type TaskRunner = (task: TaskRecord) => Promise<void>;
type Listener = () => void;

const listeners = new Set<Listener>();
const MAX_TASKS = 100;

let store: TaskStoreShape | null = null;
let nextTaskId = 1;
let running = false;
let runner: TaskRunner | null = null;

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'tasks.json');
}

function loadStore(): TaskStoreShape {
  if (store) return store;

  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    const parsed = JSON.parse(raw) as TaskStoreShape;
    store = {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    store = { tasks: [] };
  }

  for (const task of store.tasks) {
    const numericId = Number(task.id.replace(/^task-/, ''));
    if (Number.isFinite(numericId)) {
      nextTaskId = Math.max(nextTaskId, numericId + 1);
    }
    if (task.status === 'running') {
      task.status = 'failed';
      task.error = 'Interrupted when the app last closed.';
      task.updatedAt = new Date().toISOString();
    }
  }

  persist();
  return store;
}

function persist(): void {
  if (!store) return;
  fs.writeFileSync(getStorePath(), JSON.stringify(store, null, 2));
}

function emitChange(): void {
  persist();
  for (const listener of listeners) {
    listener();
  }
}

function getTaskOrThrow(taskId: string): TaskRecord {
  const task = loadStore().tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

async function processQueue(): Promise<void> {
  if (running || !runner) return;

  const nextTask = loadStore().tasks.find((task) => task.status === 'queued');
  if (!nextTask) return;

  running = true;
  updateTask(nextTask.id, { status: 'running', error: undefined });

  try {
    await runner(nextTask);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateTask(nextTask.id, {
      status: 'failed',
      error: message,
      summary: nextTask.summary || 'Task failed.',
    });
    addTaskStep(nextTask.id, `failed: ${message}`);
  } finally {
    running = false;
    void processQueue();
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setTaskRunner(nextRunner: TaskRunner): void {
  runner = nextRunner;
  void processQueue();
}

export function listTasks(): TaskRecord[] {
  return [...loadStore().tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTask(taskId: string): TaskRecord | null {
  return loadStore().tasks.find((task) => task.id === taskId) || null;
}

export function enqueueTask(prompt: string): TaskRecord {
  const now = new Date().toISOString();
  const task: TaskRecord = {
    id: `task-${nextTaskId++}`,
    prompt,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    steps: [],
  };

  loadStore().tasks.unshift(task);
  if (loadStore().tasks.length > MAX_TASKS) {
    loadStore().tasks.length = MAX_TASKS;
  }

  emitChange();
  void processQueue();
  return task;
}

export function addTaskStep(taskId: string, message: string): void {
  const task = getTaskOrThrow(taskId);
  task.steps.push({
    id: `${taskId}-step-${task.steps.length + 1}`,
    message,
    timestamp: new Date().toISOString(),
  });
  task.updatedAt = new Date().toISOString();
  emitChange();
}

export function updateTask(
  taskId: string,
  patch: Partial<Pick<TaskRecord, 'status' | 'summary' | 'error'>>
): void {
  const task = getTaskOrThrow(taskId);
  if (patch.status) task.status = patch.status;
  if (patch.summary !== undefined) task.summary = patch.summary;
  if (patch.error !== undefined) task.error = patch.error;
  task.updatedAt = new Date().toISOString();
  emitChange();
}

export function getRecentTaskSummaries(limit: number = 6): Array<{
  id: string;
  prompt: string;
  summary: string;
  status: TaskStatus;
  updatedAt: string;
}> {
  return listTasks()
    .filter((task) => task.summary)
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      prompt: task.prompt,
      summary: task.summary || '',
      status: task.status,
      updatedAt: task.updatedAt,
    }));
}
