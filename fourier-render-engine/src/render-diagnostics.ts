import type { RenderDiagnostic } from "./types.ts";

export interface DiagnosticTarget {
  onDiagnostic?: ((diagnostic: RenderDiagnostic) => void) | undefined;
}

export function emitDiagnostic(
  target: DiagnosticTarget,
  diagnostic: RenderDiagnostic,
): void {
  target.onDiagnostic?.(diagnostic);
}

export async function traceOperation<T>(
  target: DiagnosticTarget,
  input: {
    phase: RenderDiagnostic["phase"];
    scope: string;
    message: string;
    details?: Record<string, unknown>;
    heartbeatMs?: number;
  },
  operation: () => Promise<T>,
): Promise<T> {
  if (target.onDiagnostic === undefined) return operation();
  const startedAt = performance.now();
  const base = {
    phase: input.phase,
    scope: input.scope,
    message: input.message,
    ...(input.details === undefined ? {} : { details: input.details }),
  };
  emitDiagnostic(target, { ...base, status: "start" });
  const heartbeat = setInterval(() => {
    emitDiagnostic(target, {
      ...base,
      status: "waiting",
      elapsedMs: Math.round(performance.now() - startedAt),
    });
  }, input.heartbeatMs ?? 5_000);
  try {
    const result = await operation();
    emitDiagnostic(target, {
      ...base,
      status: "complete",
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return result;
  } catch (error) {
    emitDiagnostic(target, {
      ...base,
      status: "error",
      elapsedMs: Math.round(performance.now() - startedAt),
      details: {
        ...(input.details ?? {}),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
