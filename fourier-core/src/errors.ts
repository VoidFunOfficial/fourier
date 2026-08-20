export type ErrorDetails = Record<string, unknown>;

export class CoreError extends Error {
  readonly code: string;
  readonly details?: ErrorDetails;

  constructor(code: string, message: string, details?: ErrorDetails) {
    super(message);
    // Compatibility contract: render-engine exports this constructor as
    // RenderEngineError and existing serialized errors keep the old name.
    this.name = "RenderEngineError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(
  code: string,
  message: string,
  details?: ErrorDetails,
): never {
  throw new CoreError(code, message, details);
}

export function toErrorResponse(error: unknown): {
  error: { code: string; message: string; details?: ErrorDetails };
} {
  if (error instanceof CoreError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return { error: { code: "INTERNAL_ERROR", message } };
}
