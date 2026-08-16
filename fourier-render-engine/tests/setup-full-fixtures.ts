import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = join(testsDirectory, "fixtures");
const fontsDirectory = join(testsDirectory, "fonts");

async function run(args: string[]): Promise<void> {
  const process = Bun.spawn(args, {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`命令失败: ${args.join(" ")}\n${stderr}`);
  }
}

function findFont(): string {
  const candidates = [
    Bun.env.TEST_FONT_PATH,
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  ].filter((value): value is string => value !== undefined);
  const font = candidates.find(existsSync);
  if (font === undefined) {
    throw new Error(
      "找不到可用的 TTF 字体；请通过 TEST_FONT_PATH 指定字体文件",
    );
  }
  return font;
}

export async function setupFullCoverageFixtures(): Promise<void> {
  await Promise.all([
    mkdir(fixturesDirectory, { recursive: true }),
    mkdir(fontsDirectory, { recursive: true }),
  ]);
  await copyFile(findFont(), join(fontsDirectory, "TestFont.ttf"));

  await run([
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=1",
    "-frames:v",
    "1",
    join(fixturesDirectory, "background.png"),
  ]);

  await run([
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x2563EB:s=160x90",
    "-frames:v",
    "1",
    join(fixturesDirectory, "card.png"),
  ]);

  await run([
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=320x180:rate=10:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=660:sample_rate=48000:duration=2",
    "-shortest",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    join(fixturesDirectory, "video.mp4"),
  ]);

  await run([
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=48000:duration=4",
    join(fixturesDirectory, "music.wav"),
  ]);
}

if (import.meta.main) {
  await setupFullCoverageFixtures();
  console.log(`全节点测试素材已生成: ${fixturesDirectory}`);
}
