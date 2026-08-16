const TTC_SIGNATURE = "ttcf";
const TTC_VERSION_1 = 0x0001_0000;
const TTC_VERSION_2 = 0x0002_0000;
const CHECKSUM_MAGIC = 0xb1b0_afba;

interface TableRecord {
  tag: string;
  sourceOffset: number;
  length: number;
  outputOffset: number;
}

function tagAt(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function assertRange(
  byteLength: number,
  offset: number,
  length: number,
  label: string,
): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > byteLength - length
  ) {
    throw new Error(`无效的 OpenType 字体集合：${label} 超出文件范围`);
  }
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function tableChecksum(bytes: Uint8Array, offset: number, length: number): number {
  let sum = 0;
  const paddedLength = align4(length);
  for (let cursor = 0; cursor < paddedLength; cursor += 4) {
    let word = 0;
    for (let byte = 0; byte < 4; byte++) {
      word = (word << 8) | (bytes[offset + cursor + byte] ?? 0);
    }
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

/**
 * Converts the first face of a TrueType/OpenType Collection into a standalone
 * sfnt font that Satori's OpenType parser can consume. Standalone TTF, OTF and
 * WOFF inputs are returned unchanged.
 */
export function normalizeOpenTypeFont(fontData: ArrayBuffer): ArrayBuffer {
  if (fontData.byteLength < 4) return fontData;

  const source = new Uint8Array(fontData);
  const sourceView = new DataView(
    source.buffer,
    source.byteOffset,
    source.byteLength,
  );
  if (tagAt(sourceView, 0) !== TTC_SIGNATURE) return fontData;

  assertRange(source.byteLength, 0, 12, "TTC 文件头");
  const version = sourceView.getUint32(4, false);
  if (version !== TTC_VERSION_1 && version !== TTC_VERSION_2) {
    throw new Error(
      `不支持的 OpenType 字体集合版本 0x${version.toString(16).padStart(8, "0")}`,
    );
  }

  const fontCount = sourceView.getUint32(8, false);
  if (fontCount < 1) {
    throw new Error("无效的 OpenType 字体集合：集合中没有字体");
  }
  assertRange(source.byteLength, 12, fontCount * 4, "字体偏移表");

  const fontOffset = sourceView.getUint32(12, false);
  assertRange(source.byteLength, fontOffset, 12, "首个字体文件头");
  const tableCount = sourceView.getUint16(fontOffset + 4, false);
  const directoryLength = 12 + tableCount * 16;
  assertRange(
    source.byteLength,
    fontOffset,
    directoryLength,
    "首个字体的表目录",
  );

  let outputLength = directoryLength;
  const tables: TableRecord[] = [];
  for (let index = 0; index < tableCount; index++) {
    const recordOffset = fontOffset + 12 + index * 16;
    const sourceOffset = sourceView.getUint32(recordOffset + 8, false);
    const length = sourceView.getUint32(recordOffset + 12, false);
    assertRange(
      source.byteLength,
      sourceOffset,
      length,
      `字体表 ${tagAt(sourceView, recordOffset)}`,
    );
    const outputOffset = align4(outputLength);
    outputLength = outputOffset + align4(length);
    if (!Number.isSafeInteger(outputLength)) {
      throw new Error("无效的 OpenType 字体集合：字体大小溢出");
    }
    tables.push({
      tag: tagAt(sourceView, recordOffset),
      sourceOffset,
      length,
      outputOffset,
    });
  }

  const output = new Uint8Array(outputLength);
  output.set(source.subarray(fontOffset, fontOffset + 12), 0);
  const outputView = new DataView(output.buffer);
  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    if (table === undefined) continue;
    output.set(
      source.subarray(table.sourceOffset, table.sourceOffset + table.length),
      table.outputOffset,
    );
    const recordOffset = 12 + index * 16;
    for (let byte = 0; byte < 4; byte++) {
      output[recordOffset + byte] = table.tag.charCodeAt(byte);
    }
    outputView.setUint32(recordOffset + 8, table.outputOffset, false);
    outputView.setUint32(recordOffset + 12, table.length, false);
  }

  const head = tables.find((table) => table.tag === "head");
  if (head !== undefined) {
    if (head.length < 12) {
      throw new Error("无效的 OpenType 字体集合：head 表长度不足");
    }
    outputView.setUint32(head.outputOffset + 8, 0, false);
  }

  for (let index = 0; index < tables.length; index++) {
    const table = tables[index];
    if (table === undefined) continue;
    outputView.setUint32(
      12 + index * 16 + 4,
      tableChecksum(output, table.outputOffset, table.length),
      false,
    );
  }

  if (head !== undefined) {
    const checksum = tableChecksum(output, 0, output.byteLength);
    outputView.setUint32(
      head.outputOffset + 8,
      (CHECKSUM_MAGIC - checksum) >>> 0,
      false,
    );
  }

  return output.buffer;
}
