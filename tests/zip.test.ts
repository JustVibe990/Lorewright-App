import { describe, expect, it } from "vitest";
import { crc32, makeZip } from "../src/lib/zip.ts";

const enc = new TextEncoder();

describe("zip", () => {
  it("computes CRC-32", () => {
    expect(crc32(enc.encode("hello"))).toBe(0x3610a686);
  });

  it("writes headers, data and a central directory", () => {
    const zip = makeZip([
      { path: "Session 1.md", data: enc.encode("# Hi") },
      { path: "Characters/Ash.json", data: enc.encode("{}") },
    ]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    // End record: 2 entries, central directory right after the file data.
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(new TextDecoder().decode(zip.slice(30, 30 + 12))).toBe("Session 1.md");
  });
});
