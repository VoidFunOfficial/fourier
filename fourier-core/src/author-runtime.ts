import type { ResolveAuthorImport } from "./integration-types.ts";

const REACT_RUNTIME_IMPORTS = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

const SDK_AUTHOR_IMPORTS = new Set([
  "@fourier-video/sdk",
  "@fourier-video/sdk/react",
  "@fourier-video/sdk/motion",
  "@fourier-video/sdk/three",
  "@fourier-video/sdk/universe",
  "@fourier-video/sdk/universe-3d",
  "@fourier-video/sdk/phy2d",
  "@fourier-video/sdk/schema",
  "@fourier-video/sdk/project",
  "@fourier-video/sdk/react-runtime",
  "@fourier-video/sdk/jsx-runtime",
  "@fourier-video/sdk/jsx-dev-runtime",
]);

export function isReactRuntimeImport(specifier: string): boolean {
  return REACT_RUNTIME_IMPORTS.has(specifier);
}

export function isSdkAuthorImport(specifier: string): boolean {
  return SDK_AUTHOR_IMPORTS.has(specifier);
}

export function isCompilerInjectedReactImport(dependency: {
  readonly kind: string;
  readonly path: string;
}): boolean {
  return dependency.kind === "require-call" && isReactRuntimeImport(dependency.path);
}

export function authorRuntimeAliasPlugin(
  name: string,
  resolveAuthorImport: ResolveAuthorImport,
  options: { reactDom?: boolean } = {},
): Bun.BunPlugin {
  const specifiers = [
    ...REACT_RUNTIME_IMPORTS,
    ...SDK_AUTHOR_IMPORTS,
    ...(options.reactDom ? ["react-dom", "react-dom/client"] : []),
  ];
  const aliases = new Map(
    specifiers.map((specifier) => [specifier, resolveAuthorImport(specifier)]),
  );
  return {
    name,
    setup(build) {
      build.onResolve(
        { filter: /^(?:react(?:\/jsx-(?:dev-)?runtime)?|react-dom(?:\/client)?|@fourier-video\/sdk(?:\/(?:react|motion|three|universe|universe-3d|phy2d|schema|project|react-runtime|jsx-runtime|jsx-dev-runtime))?)$/ },
        (args) => ({ path: aliases.get(args.path)! }),
      );
    },
  };
}
