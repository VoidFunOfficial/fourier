export class SdkError extends Error {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "SdkError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function sdkFail(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new SdkError(code, message, details);
}
