import { build, transform, type BuildOptions, type BuildResult, type Loader, type Plugin } from "esbuild";
import { init, parse } from "es-module-lexer";

export interface ScannedModuleImport {
  readonly kind: "import-statement" | "dynamic-import";
  readonly path?: string;
}

const browserAssetLoaders: Readonly<Record<string, Loader>> = Object.freeze({
  ".avif": "dataurl",
  ".bmp": "dataurl",
  ".gif": "dataurl",
  ".glb": "dataurl",
  ".jpeg": "dataurl",
  ".jpg": "dataurl",
  ".mp3": "dataurl",
  ".mp4": "dataurl",
  ".ogg": "dataurl",
  ".otf": "dataurl",
  ".png": "dataurl",
  ".svg": "dataurl",
  ".ttf": "dataurl",
  ".wav": "dataurl",
  ".webm": "dataurl",
  ".webp": "dataurl",
  ".woff": "dataurl",
  ".woff2": "dataurl",
});

/** Parses import syntax without evaluating or resolving author code. */
export async function scanModuleImports(
  source: string,
  loader: Loader,
): Promise<readonly ScannedModuleImport[]> {
  const parsedSource = await transform(source, {
    loader,
    format: "esm",
    // This output is only fed to the import lexer. Classic lowering removes
    // JSX syntax without injecting a synthetic react/jsx-runtime import.
    jsx: "transform",
    sourcemap: false,
    legalComments: "none",
  });
  await init;
  const [imports] = parse(parsedSource.code);
  return Object.freeze(imports.map((entry) => Object.freeze({
    kind: entry.d >= 0 ? "dynamic-import" as const : "import-statement" as const,
    ...(entry.n === undefined ? {} : { path: entry.n }),
  })));
}

export interface SecureBrowserBundleOptions {
  readonly entryPoint: string;
  readonly plugins: readonly Plugin[];
  readonly minifyWhitespace?: boolean;
}

/**
 * The only author-code bundler used by Core. It always produces browser data;
 * no generated module is imported by the Node/Bun host process.
 */
export async function buildSecureBrowserBundle(
  options: SecureBrowserBundleOptions,
): Promise<BuildResult<BuildOptions>> {
  return build({
    entryPoints: [options.entryPoint],
    bundle: true,
    write: false,
    outdir: "fourier-secure-browser-output",
    entryNames: "bundle",
    platform: "browser",
    format: "iife",
    target: ["es2022"],
    jsx: "automatic",
    jsxImportSource: "react",
    sourcemap: false,
    legalComments: "none",
    charset: "utf8",
    minifyWhitespace: options.minifyWhitespace ?? true,
    minifyIdentifiers: false,
    minifySyntax: false,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    loader: browserAssetLoaders,
    logLevel: "silent",
    plugins: [{
      name: "fourier-absolute-file-imports",
      setup(context) {
        context.onResolve({ filter: /^(?:\/|[A-Za-z]:[\\/])/ }, (args) => ({
          path: args.path,
          namespace: "file",
        }));
      },
    }, ...options.plugins],
  });
}

export function formatBrowserBuildFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "errors" in error) {
    const errors = (error as { errors?: readonly { text?: string; location?: { file?: string; line?: number; column?: number } | null }[] }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.map((entry) => {
        const location = entry.location;
        const prefix = location?.file === undefined ? "" : `${location.file}:${location.line ?? 0}:${location.column ?? 0}: `;
        return `${prefix}${entry.text ?? "browser build failed"}`;
      }).join("\n");
    }
  }
  return error instanceof Error ? error.message : String(error);
}
