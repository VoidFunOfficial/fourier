import { CoreError } from "./errors.ts";

export interface BoundedWorkerRunnerLimits {
  readonly concurrency: number;
  readonly maxQueued: number;
  readonly timeoutMs: number;
}

interface QueueEntry<T> {
  readonly task: (signal: AbortSignal) => Promise<T>;
  readonly externalSignal?: AbortSignal;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
  removeAbortListener?: () => void;
}

const DEFAULT_LIMITS: BoundedWorkerRunnerLimits = Object.freeze({
  concurrency: 2,
  maxQueued: 16,
  timeoutMs: 30_000,
});

function abortError(): CoreError {
  return new CoreError("ARTIFACT_EXECUTION_FAILED", "安全执行已取消");
}

/**
 * Owns admission, cancellation, and wall-clock limits for isolated evaluators.
 * The runner never accepts caller-defined limits, so profiles remain policy.
 */
export class BoundedWorkerRunner {
  readonly #limits: BoundedWorkerRunnerLimits;
  readonly #queue: QueueEntry<unknown>[] = [];
  #running = 0;

  constructor(limits: Partial<BoundedWorkerRunnerLimits> = {}) {
    this.#limits = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
    if (
      !Number.isSafeInteger(this.#limits.concurrency) || this.#limits.concurrency <= 0 ||
      !Number.isSafeInteger(this.#limits.maxQueued) || this.#limits.maxQueued < 0 ||
      !Number.isSafeInteger(this.#limits.timeoutMs) || this.#limits.timeoutMs <= 0
    ) {
      throw new CoreError("SECURE_EXECUTION_LIMIT", "安全执行 runner limits 无效");
    }
  }

  get running(): number {
    return this.#running;
  }

  get queued(): number {
    return this.#queue.length;
  }

  run<T>(
    task: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    if (externalSignal?.aborted) return Promise.reject(abortError());
    if (this.#running >= this.#limits.concurrency && this.#queue.length >= this.#limits.maxQueued) {
      return Promise.reject(new CoreError(
        "SECURE_EXECUTION_LIMIT",
        "安全执行队列已满",
        { running: this.#running, queued: this.#queue.length },
      ));
    }

    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        task,
        resolve,
        reject,
        ...(externalSignal === undefined ? {} : { externalSignal }),
      };
      if (externalSignal !== undefined) {
        const abort = () => {
          const index = this.#queue.indexOf(entry as QueueEntry<unknown>);
          if (index >= 0) {
            this.#queue.splice(index, 1);
            entry.removeAbortListener?.();
            reject(abortError());
          }
        };
        externalSignal.addEventListener("abort", abort, { once: true });
        entry.removeAbortListener = () => externalSignal.removeEventListener("abort", abort);
      }
      this.#queue.push(entry as QueueEntry<unknown>);
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#running < this.#limits.concurrency) {
      const entry = this.#queue.shift();
      if (entry === undefined) return;
      entry.removeAbortListener?.();
      this.#running += 1;
      void this.#execute(entry).finally(() => {
        this.#running -= 1;
        this.#drain();
      });
    }
  }

  async #execute(entry: QueueEntry<unknown>): Promise<void> {
    const controller = new AbortController();
    const externalAbort = () => controller.abort(abortError());
    entry.externalSignal?.addEventListener("abort", externalAbort, { once: true });
    const timeout = setTimeout(() => {
      controller.abort(new CoreError(
        "SECURE_EXECUTION_TIMEOUT",
        `安全执行超过 ${this.#limits.timeoutMs}ms`,
        { timeoutMs: this.#limits.timeoutMs },
      ));
    }, this.#limits.timeoutMs);

    try {
      const value = await Promise.race([
        entry.task(controller.signal),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(controller.signal.reason ?? abortError());
          }, { once: true });
        }),
      ]);
      entry.resolve(value);
    } catch (error) {
      entry.reject(error);
    } finally {
      clearTimeout(timeout);
      entry.externalSignal?.removeEventListener("abort", externalAbort);
    }
  }
}
