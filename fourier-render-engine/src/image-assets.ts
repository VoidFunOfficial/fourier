import { createHash } from "node:crypto";
import { basename } from "node:path";

export const FOURIER_IMAGE_ASSET_ROUTE =
  "https://fourier.invalid/__fourier_image_assets__/**";

export const imageAssetExtensions = Object.freeze([
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
] as const);

const imageMimeTypes = Object.freeze({
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
} as const);

export interface BundledImageAsset {
  readonly url: string;
  readonly mimeType: string;
  readonly base64: string;
}

/**
 * Bun 1.3's dataurl loader emits an empty string for target=bun. Stable virtual
 * URLs keep metadata/server/browser values identical without bloating scripts.
 */
export function imageAssetUrlPlugin(
  name: string,
  onAsset?: (asset: BundledImageAsset) => void,
) {
  return {
    name,
    setup(build: Bun.PluginBuilder) {
      build.onLoad(
        { filter: /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i },
        async (args) => {
          const extension = args.path
            .slice(args.path.lastIndexOf("."))
            .toLowerCase() as keyof typeof imageMimeTypes;
          const mimeType = imageMimeTypes[extension];
          const bytes = new Uint8Array(await Bun.file(args.path).arrayBuffer());
          const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 24);
          const filename = encodeURIComponent(basename(args.path));
          const url = `https://fourier.invalid/__fourier_image_assets__/${hash}/${filename}`;
          onAsset?.(Object.freeze({
            url,
            mimeType,
            base64: Buffer.from(bytes).toString("base64"),
          }));
          return {
            contents: `export default ${JSON.stringify(url)};`,
            loader: "js" as const,
          };
        },
      );
    },
  };
}
