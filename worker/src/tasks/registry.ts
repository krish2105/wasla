import { extractResume } from './extract-resume.js';

/**
 * A named unit of AI work. The prompt and schema live here, server-side, so a
 * client cannot rewrite them, cache keys stay stable, and every caller of a
 * task gets the same contract.
 */
export interface Task {
  readonly name: string;
  /** Part of the cache key. Bump it whenever `schema` changes shape. */
  readonly schemaVersion: number;
  readonly system: string;
  /** JSON Schema the provider must satisfy. */
  readonly schema: Record<string, unknown>;
  /**
   * Seconds to cache a result, or 0 for never.
   *
   * The KV free plan allows 1,000 writes per day and every stored miss costs
   * one, so caching is opt-in per task rather than the default.
   */
  readonly cacheTtl: number;
  /** True when the task's input is a PDF rather than text. */
  readonly takesDocument: boolean;
  /** Turns validated input into the user-message body. */
  prompt(input: unknown): string;

  /**
   * Optional. Runs after the provider's JSON is parsed, with the source text
   * the claims must be grounded in. Returns the value to send back, plus a
   * count of claims dropped for being ungrounded.
   *
   * This is a task-level hook rather than route logic because what counts as a
   * grounded claim is specific to a task's schema.
   */
  postprocess?(
    parsed: unknown,
    sourceText: string
  ): { value: unknown; droppedClaims: number };
}

const TASKS: Record<string, Task> = {
  [extractResume.name]: extractResume,
};

export function getTask(name: string): Task | null {
  return TASKS[name] ?? null;
}

export function taskNames(): string[] {
  return Object.keys(TASKS);
}
