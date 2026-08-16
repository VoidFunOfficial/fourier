import type { RenderNode, ResolvedProject } from "./types.ts";

function publicNode(node: RenderNode, scope: string): Record<string, unknown> {
  const common = {
    id: node.id,
    scopedId: `${scope}${node.id}`,
    kind: node.kind,
    startFrame: node.startFrame,
    endFrame: node.endFrame,
    durationFrames: node.durationFrames,
    enabled: node.enabled,
    preview: node.preview,
  };
  if (node.kind === "audio") {
    return { ...common, src: node.src, inFrame: node.inFrame };
  }
  if (node.kind === "video") {
    return {
      ...common,
      src: node.src,
      inFrame: node.inFrame,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      layer: node.layer,
      modifiers: node.modifiers,
    };
  }
  return {
    ...common,
    ...(node.kind === "image" ? { src: node.src } : {}),
    ...(node.kind === "react" ? { component: node.component } : {}),
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    layer: node.layer,
    ...((node.kind === "text" || node.kind === "subtitle") &&
    node.voice !== undefined
      ? {
          voice: {
            ...(node.voice.style === undefined
              ? {}
              : { style: node.voice.style }),
            volume: node.voice.volume,
            ...(node.voice.reference === undefined
              ? {}
              : { reference: node.voice.reference }),
            samples: node.voice.samples,
            sampleRate: node.voice.sampleRate,
            durationSeconds: node.voice.durationSeconds,
          },
        }
      : {}),
    modifiers: node.modifiers,
  };
}

export interface ProjectSummary {
  project: ResolvedProject["metadata"];
  canvas: ResolvedProject["canvas"];
  declaredDurationFrames?: number;
  totalFrames: number;
  durationSeconds: number;
  nodes: Record<string, unknown>[];
  groups: Array<{
    id: string;
    scopedId: string;
    mode: "parallel" | "sequence";
    startFrame: number;
    endFrame: number;
    durationFrames: number;
    enabled: boolean;
    preview: boolean;
    childIds: string[];
  }>;
  scenes: Array<{
    id: string;
    scopedId: string;
    src: string;
    sourcePath: string;
    startFrame: number;
    endFrame: number;
    rawDurationFrames: number;
    inFrame: number;
    outFrame: number;
    durationFrames: number;
    layer: number;
    opacity: number;
    blend: string;
    audio: boolean;
    volume: number;
    overflow: string;
    preview: boolean;
    project: ProjectSummary;
  }>;
  templates: Array<{
    id: string;
    scopedId: string;
    src: string;
    sourcePath: string;
    startFrame: number;
    endFrame: number;
    rawDurationFrames: number;
    inFrame: number;
    outFrame: number;
    durationFrames: number;
    layer: number;
    opacity: number;
    blend: string;
    audio: boolean;
    volume: number;
    overflow: string;
    preview: boolean;
    parameterContract: ResolvedProject["templateNodes"][number]["parameterContract"];
    bindings: ResolvedProject["templateNodes"][number]["bindings"];
    parameterSources: ResolvedProject["templateNodes"][number]["parameterSources"];
    project: ProjectSummary;
  }>;
}

export function summarizeProject(
  project: ResolvedProject,
  scope = "",
): ProjectSummary {
  return {
    project: project.metadata,
    canvas: project.canvas,
    ...(project.declaredDurationFrames === undefined
      ? {}
      : { declaredDurationFrames: project.declaredDurationFrames }),
    totalFrames: project.totalFrames,
    durationSeconds: project.totalFrames / project.canvas.fps,
    nodes: project.nodes.map((node) => publicNode(node, scope)),
    groups: project.groups.map((group) => ({
      id: group.id,
      scopedId: `${scope}${group.id}`,
      mode: group.mode,
      startFrame: group.startFrame,
      endFrame: group.endFrame,
      durationFrames: group.durationFrames,
      enabled: group.enabled,
      preview: group.preview,
      childIds: group.childIds,
    })),
    scenes: project.sceneNodes.map((scene) => ({
      id: scene.id,
      scopedId: `${scope}${scene.id}`,
      src: scene.src,
      sourcePath: scene.sourcePath,
      startFrame: scene.startFrame,
      endFrame: scene.endFrame,
      rawDurationFrames: scene.rawDurationFrames,
      inFrame: scene.inFrame,
      outFrame: scene.outFrame,
      durationFrames: scene.durationFrames,
      layer: scene.layer,
      opacity: scene.opacity,
      blend: scene.blend,
      audio: scene.audio,
      volume: scene.volume,
      overflow: scene.overflow,
      preview: scene.preview,
      project: summarizeProject(scene.project, `${scope}${scene.id}::`),
    })),
    templates: project.templateNodes.map((template) => ({
      id: template.id,
      scopedId: `${scope}${template.id}`,
      src: template.src,
      sourcePath: template.sourcePath,
      startFrame: template.startFrame,
      endFrame: template.endFrame,
      rawDurationFrames: template.rawDurationFrames,
      inFrame: template.inFrame,
      outFrame: template.outFrame,
      durationFrames: template.durationFrames,
      layer: template.layer,
      opacity: template.opacity,
      blend: template.blend,
      audio: template.audio,
      volume: template.volume,
      overflow: template.overflow,
      preview: template.preview,
      parameterContract: template.parameterContract,
      bindings: template.bindings,
      parameterSources: template.parameterSources,
      project: summarizeProject(template.project, `${scope}${template.id}::`),
    })),
  };
}
