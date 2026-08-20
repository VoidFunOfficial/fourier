import {
  VisualTimelineRuntime as CoreVisualTimelineRuntime,
  type VisualTimelineRuntimeOptions as CoreVisualTimelineRuntimeOptions,
} from "@fourier-video/core/timeline";
import { resolveAuthorImport } from "./core-host.ts";

export {
  DomTimelineAdapter,
  defaultDomPageCount,
  effectiveDomPageCount,
} from "@fourier-video/core/timeline";
export type {
  TimelineInstance,
  TimelineSampleRequest,
  TimelineSampleResult,
  TimelineVideoSurface,
} from "@fourier-video/core/timeline";

/** Backward-compatible resolver-bound facade over Core's DOM timeline runtime. */
export class VisualTimelineRuntime extends CoreVisualTimelineRuntime {
  constructor(options: Omit<CoreVisualTimelineRuntimeOptions, "resolveAuthorImport"> = {}) {
    super({ ...options, resolveAuthorImport });
  }
}
