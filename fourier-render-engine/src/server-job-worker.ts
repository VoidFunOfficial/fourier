import { summarizeProject } from "./project-summary.ts";
import { renderProject, validateProject } from "./renderer.ts";
import { toErrorResponse } from "./errors.ts";

type JobRequest =
  | { readonly revision: 1; readonly kind: "validate"; readonly project: string; readonly options: Record<string, unknown> }
  | { readonly revision: 1; readonly kind: "render"; readonly project: string; readonly options: Record<string, unknown> };

try {
  const request = JSON.parse(await Bun.stdin.text()) as JobRequest;
  if (request.revision !== 1 || (request.kind !== "validate" && request.kind !== "render")) {
    throw new TypeError("Invalid server job protocol");
  }
  const value = request.kind === "validate"
    ? { valid: true, ir: summarizeProject(await validateProject(request.project, request.options)) }
    : await renderProject(request.project, request.options as never);
  await Bun.write(Bun.stdout, JSON.stringify({ revision: 1, ok: true, value }));
} catch (error) {
  await Bun.write(Bun.stdout, JSON.stringify({ revision: 1, ok: false, ...toErrorResponse(error) }));
  process.exitCode = 2;
}
