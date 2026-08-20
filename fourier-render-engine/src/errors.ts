import { CoreError } from "@fourier-video/core";

export { CoreError as RenderEngineError, toErrorResponse } from "@fourier-video/core";
export type { ErrorDetails } from "@fourier-video/core";

export function fail(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new CoreError(code, message, details);
}
