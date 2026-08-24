import { dirname, resolve } from "node:path";
import type {
  MaterializedProjectModule,
  ProjectDefinitionSnapshotV1,
} from "@fourier-video/core/artifact";
import { renderArtifactHost } from "./core-host.ts";

export interface LoadedProjectModule {
  readonly definition: ProjectDefinitionSnapshotV1;
  readonly sourcePath: string;
  readonly bundleHash: string;
  readonly executionRevision: "project-wire-v1";
}

export interface LoadProjectModuleOptions {
  readonly moduleRoot?: string;
  readonly projectRoot?: string;
  readonly bindings?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
}

function loaded(module: MaterializedProjectModule): LoadedProjectModule {
  return Object.freeze({
    definition: module.definition,
    sourcePath: module.sourcePath,
    bundleHash: module.sourceFingerprint,
    executionRevision: module.executionRevision,
  });
}

/** One top-level load owns one policy/root context while modules use isolated Workers. */
export class ProjectExecutionSession {
  readonly #projectRoot: string;
  readonly #signal: AbortSignal | undefined;

  constructor(projectRoot: string, signal?: AbortSignal) {
    this.#projectRoot = resolve(projectRoot);
    this.#signal = signal;
  }

  async load(
    entryPath: string,
    bindings: Readonly<Record<string, unknown>> = {},
  ): Promise<LoadedProjectModule> {
    const sourcePath = resolve(entryPath);
    return loaded(await renderArtifactHost.materializeProjectModule({
      entryPath: sourcePath,
      moduleRoot: dirname(sourcePath),
      projectRoot: this.#projectRoot,
      bindings,
      ...(this.#signal === undefined ? {} : { signal: this.#signal }),
    }));
  }
}

export async function loadProjectModule(
  entryPath: string,
  options: LoadProjectModuleOptions = {},
): Promise<LoadedProjectModule> {
  const sourcePath = resolve(entryPath);
  return loaded(await renderArtifactHost.materializeProjectModule({
    entryPath: sourcePath,
    moduleRoot: options.moduleRoot ?? dirname(sourcePath),
    projectRoot: options.projectRoot ?? dirname(sourcePath),
    bindings: options.bindings ?? {},
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }));
}
