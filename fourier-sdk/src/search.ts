import {
  DEFAULT_FOURIER_WORLD_URL,
  FourierWorldClient,
  type WorldSearchOptions,
  type WorldSearchResponse,
} from "./world-client.ts";

export interface SearchFourierWorldOptions extends WorldSearchOptions {
  /** Defaults to https://www.fourier.video or FOURIER_WORLD_URL in the CLI. */
  readonly worldUrl?: string;
  /** Optional Fetch implementation for non-default runtimes and tests. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Search published Fourier World components by natural-language intent.
 * No Fourier World login is required.
 */
export async function searchFourierWorld(
  query: string,
  options: SearchFourierWorldOptions = {},
): Promise<WorldSearchResponse> {
  const client = new FourierWorldClient({
    worldUrl: options.worldUrl ?? DEFAULT_FOURIER_WORLD_URL,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  return client.search(query, options);
}

export {
  DEFAULT_FOURIER_WORLD_URL,
  FourierWorldApiError,
  normalizeWorldUrl,
} from "./world-client.ts";
export type {
  WorldSearchAuthor,
  WorldSearchMatch,
  WorldSearchMedia,
  WorldSearchMetrics,
  WorldSearchOptions,
  WorldSearchResponse,
  WorldSearchResult,
} from "./world-client.ts";
export type {
  WorldComponentType,
  WorldLanguage,
  WorldMood,
  WorldStyle,
} from "./world-manifest.ts";
