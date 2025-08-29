import { getDAOs } from '../db/dao';

export type NetworkStage = 'initialized' | 'policy_set' | 'planning' | 'executing' | 'finalizing' | 'completed';

export const ERROR_CODES = {
  POLICY_NOT_SET: 'POLICY_NOT_SET',
  INVALID_STAGE: 'INVALID_STAGE',
  ROLE_FORBIDDEN: 'ROLE_FORBIDDEN',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_NOT_QUEUED: 'TASK_NOT_QUEUED',
  TASK_ALREADY_RUNNING: 'TASK_ALREADY_RUNNING',
  NO_PENDING_TASKS: 'NO_PENDING_TASKS',
  RESULT_PARTIAL_CONTINUE_REQUIRED: 'RESULT_PARTIAL_CONTINUE_REQUIRED',
  NO_PARTIAL_TO_CONTINUE: 'NO_PARTIAL_TO_CONTINUE',
  SUBTASKS_INCOMPLETE: 'SUBTASKS_INCOMPLETE',
  NETWORK_ID_MISMATCH: 'NETWORK_ID_MISMATCH',
  PREVIOUS_STEP_NOT_COMPLETED: 'PREVIOUS_STEP_NOT_COMPLETED',
  ACTIVE_TASK_EXISTS: 'ACTIVE_TASK_EXISTS',
  INVALID_STEP_ORDER: 'INVALID_STEP_ORDER',
  STEP_NUMBER_REQUIRED: 'STEP_NUMBER_REQUIRED',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export function ok<T extends object>(payload?: T) {
  return { success: true, ...(payload || ({} as T)) } as { success: true } & T;
}

export function fail<T extends object>(errorCode: ErrorCode, message: string, extra?: T) {
  return { success: false, errorCode, message, ...(extra || ({} as T)) } as { success: false; errorCode: ErrorCode; message: string } & T;
}

// ---- Stage helpers (stored on main network task metadata.stage) ----
export async function getNetworkStage(networkId: string): Promise<NetworkStage> {
  const daos = getDAOs();
  const main = await daos.tasks.findById(networkId);
  const stage = (main?.metadata as Record<string, unknown> | undefined)?.stage as NetworkStage | undefined;
  return stage || 'initialized';
}

export async function setNetworkStage(networkId: string, stage: NetworkStage): Promise<void> {
  const daos = getDAOs();
  const main = await daos.tasks.findById(networkId);
  const current = (main?.metadata as Record<string, unknown> | undefined) || {};
  await daos.tasks.updateMetadata(networkId, { ...current, stage });
}

export async function mergeNetworkMetadata(networkId: string, patch: Record<string, unknown>): Promise<void> {
  const daos = getDAOs();
  const main = await daos.tasks.findById(networkId);
  const current = (main?.metadata as Record<string, unknown> | undefined) || {};
  await daos.tasks.updateMetadata(networkId, { ...current, ...patch });
}

export async function requireStage(networkId: string, allowed: NetworkStage[]) {
  const stage = await getNetworkStage(networkId);
  if (!allowed.includes(stage)) {
    return fail(ERROR_CODES.INVALID_STAGE, `Operation not allowed at stage '${stage}'. Allowed: ${allowed.join(', ')}`, { stage });
  }
  return ok({ stage });
}

export async function requirePolicy(networkId: string) {
  const daos = getDAOs();
  const main = await daos.tasks.findById(networkId);
  const policy = (main?.metadata as Record<string, unknown> | undefined)?.policy;
  if (!policy) return fail(ERROR_CODES.POLICY_NOT_SET, 'Policy is not set. CEO decision required.');
  return ok({ policy });
}

// ---- Task helpers ----
export async function requireTaskExists(taskId: string) {
  const daos = getDAOs();
  const t = await daos.tasks.findById(taskId);
  if (!t) return fail(ERROR_CODES.TASK_NOT_FOUND, `Task ${taskId} not found`);
  return ok({ task: t });
}

export function ensureQueued(task: { status: string }) {
  if (task.status !== 'queued') return fail(ERROR_CODES.TASK_NOT_QUEUED, `Task is not queued (status=${task.status})`);
  return ok({});
}

export function ensureNotRunning(task: { status: string }) {
  if (task.status === 'running') return fail(ERROR_CODES.TASK_ALREADY_RUNNING, 'Task is already running');
  return ok({});
}

// Partial-result continuity
export function checkPartialContinuity(task: { metadata?: unknown }, authorAgentId: string, finalize: boolean) {
  const md = (task.metadata as Record<string, unknown> | undefined) || {};
  const partial = (md.result as Record<string, unknown> | undefined)?.partial as boolean | undefined;
  const lastAuthor = (md.result as Record<string, unknown> | undefined)?.lastAuthor as string | undefined;

  if (!finalize) return ok({ partial: !!partial, lastAuthor });

  if (partial && lastAuthor && lastAuthor !== authorAgentId) {
    return fail(ERROR_CODES.RESULT_PARTIAL_CONTINUE_REQUIRED, `Finalization must be continued by the same worker (${lastAuthor}).`, { lastAuthor });
  }
  return ok({});
}

export function computeNextStageOnFirstRun(currentStage: NetworkStage): NetworkStage {
  // planning -> executing への一回限りの遷移を許容
  if (currentStage === 'planning') return 'executing';
  return currentStage;
}

export async function allSubtasksCompleted(networkId: string) {
  const daos = getDAOs();
  const tasks = await daos.tasks.findByNetworkId(networkId);
  const subs = tasks.filter((t) => t.step_number !== null && t.step_number !== undefined);
  const incomplete = subs.filter((t) => t.status !== 'completed');
  const anyPartial = subs.some((t) => {
    const m = (t.metadata as Record<string, unknown> | undefined) || {};
    return !!(m.result as Record<string, unknown> | undefined)?.partial;
  });
  if (subs.length === 0 || incomplete.length > 0 || anyPartial) {
    return fail(ERROR_CODES.SUBTASKS_INCOMPLETE, 'Subtasks are incomplete or contain partial results.');
  }
  return ok({});
}

export async function getNextRunnableStep(networkId: string): Promise<number | null> {
  const daos = getDAOs();
  const tasks = await daos.tasks.findByNetworkId(networkId);
  const subs = tasks.filter((t) => typeof t.step_number === 'number');
  if (subs.length === 0) return null;
  const byStep = new Map<number, typeof subs[0][]>()
  subs.forEach(t => {
    const s = (t.step_number as number);
    const arr = byStep.get(s) || [];
    arr.push(t);
    byStep.set(s, arr);
  });
  const steps = Array.from(byStep.keys()).sort((a,b)=>a-b);
  for (const s of steps) {
    const arr = byStep.get(s)!;
    const allCompleted = arr.every(t => t.status === 'completed');
    if (!allCompleted) return s; // first step with any non-completed task
  }
  return null; // all completed
}

export async function ensureTaskIsNextAndNoConcurrent(networkId: string, task: { step_number?: number | null }) {
  if (typeof task.step_number !== 'number') {
    return fail(ERROR_CODES.STEP_NUMBER_REQUIRED, 'Subtask requires a step_number to start running.');
  }
  const daos = getDAOs();
  const running = await daos.tasks.findByNetworkAndStatus(networkId, 'running');
  const hasRunning = running.some(t => typeof t.step_number === 'number');
  if (hasRunning) {
    return fail(ERROR_CODES.ACTIVE_TASK_EXISTS, 'Another subtask is already running.');
  }
  const next = await getNextRunnableStep(networkId);
  if (next !== null && task.step_number !== next) {
    return fail(ERROR_CODES.PREVIOUS_STEP_NOT_COMPLETED, `Cannot start step ${task.step_number}. Next runnable step is ${next}.`);
  }
  return ok({});
}

export function ensureRole(runtimeContext: unknown, allowed: string[]) {
  try {
    const role = (runtimeContext as { get?: (k: string) => unknown })?.get?.('agentRole') as string | undefined;
    if (role && !allowed.includes(role)) {
      return fail(ERROR_CODES.ROLE_FORBIDDEN, `Role '${role}' is not allowed. Allowed: ${allowed.join(', ')}`);
    }
  } catch {}
  return ok({});
}
