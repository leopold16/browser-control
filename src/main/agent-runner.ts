import { logActivity } from './activity-log';
import { executeAction } from './actions';
import { getSnapshot } from './snapshot';
import { getActiveTab } from './tab-manager';
import { addTaskStep, getRecentTaskSummaries, updateTask, TaskRecord } from './task-manager';

type SnapshotResponse = {
  url: string;
  title: string;
  tree: unknown[];
};

type ActionDecision = {
  type: string;
  ref?: number;
  url?: string;
  text?: string;
  key?: string;
  value?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  ms?: number;
  result?: string;
};

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_STEPS = 16;

function buildSystemPrompt(task: TaskRecord): string {
  const history = getRecentTaskSummaries(4)
    .filter((entry) => entry.id !== task.id)
    .map((entry) => `- ${entry.prompt}: ${entry.summary}`)
    .join('\n');

  const priorSteps = task.steps.slice(-8).map((step) => `- ${step.message}`).join('\n');

  return [
    'You are a browser automation agent running inside a desktop browser.',
    'Respond ONLY with compact JSON and no markdown.',
    '',
    'Allowed actions:',
    '{ "type": "navigate", "url": "https://..." }',
    '{ "type": "click", "ref": 1 }',
    '{ "type": "type", "ref": 1, "text": "..." }',
    '{ "type": "append", "ref": 1, "text": "..." }',
    '{ "type": "key", "key": "Enter" }',
    '{ "type": "select", "ref": 1, "value": "..." }',
    '{ "type": "scroll", "direction": "down" }',
    '{ "type": "hover", "ref": 1 }',
    '{ "type": "wait", "ms": 1200 }',
    '{ "type": "done", "result": "final answer" }',
    '',
    'Rules:',
    '- Prefer existing refs from the snapshot instead of blind navigation.',
    '- Be careful with text inputs. After typing, validate from the next snapshot before moving on.',
    '- If the page changed or a ref no longer exists, take the new snapshot into account.',
    '- Keep actions minimal, grounded, and deterministic.',
    '',
    `Task: ${task.prompt}`,
    history ? `Recent successful task summaries:\n${history}` : 'Recent successful task summaries:\n- none',
    priorSteps ? `Steps already taken in this task:\n${priorSteps}` : 'Steps already taken in this task:\n- none',
  ].join('\n');
}

async function callOpenRouter(
  model: string,
  openRouterApiKey: string,
  systemPrompt: string,
  snapshot: SnapshotResponse
): Promise<ActionDecision> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'browser-control',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            snapshot: {
              url: snapshot.url,
              title: snapshot.title,
              tree: snapshot.tree,
            },
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenRouter returned empty response content');
  }

  try {
    return JSON.parse(content) as ActionDecision;
  } catch {
    throw new Error(`Could not parse LLM JSON action: ${content}`);
  }
}

function summarizeAction(action: ActionDecision): string {
  if (action.type === 'done') {
    return `done: ${action.result || 'completed'}`;
  }
  if (action.type === 'navigate') {
    return `navigate ${action.url || ''}`.trim();
  }
  if (action.type === 'click') return `click ref ${action.ref}`;
  if (action.type === 'type') return `type ref ${action.ref}`;
  if (action.type === 'append') return `append ref ${action.ref}`;
  if (action.type === 'wait') return `wait ${action.ms || 1200}ms`;
  if (action.type === 'select') return `select ref ${action.ref}`;
  if (action.type === 'scroll') return `scroll ${action.direction || 'down'}`;
  return action.type;
}

export async function runTask(task: TaskRecord): Promise<void> {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    updateTask(task.id, {
      status: 'failed',
      summary: 'Missing OPENROUTER_API_KEY for in-app task execution.',
      error: 'Missing OPENROUTER_API_KEY for in-app task execution.',
    });
    addTaskStep(task.id, 'failed: missing OPENROUTER_API_KEY');
    return;
  }

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  logActivity('task', 'Task started', task.prompt);
  addTaskStep(task.id, 'queued context loaded');

  for (let index = 0; index < MAX_STEPS; index++) {
    const tab = getActiveTab();
    if (!tab) {
      throw new Error('No active tab');
    }

    const snapshot = await getSnapshot(tab.view.webContents, true);
    const systemPrompt = buildSystemPrompt(task);
    const decision = await callOpenRouter(model, openRouterApiKey, systemPrompt, snapshot);
    const stepSummary = summarizeAction(decision);

    addTaskStep(task.id, stepSummary);
    logActivity('task', `Task ${task.id}`, stepSummary);

    if (decision.type === 'done') {
      updateTask(task.id, {
        status: 'done',
        summary: decision.result || 'Task completed.',
        error: undefined,
      });
      logActivity('task', 'Task completed', decision.result || task.prompt);
      return;
    }

    const result = await executeAction(decision);
    if (!result.ok) {
      throw new Error(result.error || 'Action failed');
    }
  }

  throw new Error(`Reached max steps (${MAX_STEPS}) before done action.`);
}
