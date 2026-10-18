import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny fake Documents folder: a set of existing paths and a log of renames.
const fake = { paths: new Set<string>(), renames: [] as [string, string][], failRename: false };
vi.mock("../src/lib/fsapi.ts", () => ({
  BaseDirectory: { AppData: 1, Document: 2 },
  exists: async (p: string) => fake.paths.has(p),
  mkdir: async (p: string) => void fake.paths.add(p),
  readDir: async () => [],
  readTextFile: async () => "",
  writeTextFile: async () => {},
  remove: async () => {},
  stat: async () => ({ mtime: null }),
  rename: async (a: string, b: string) => {
    if (fake.failRename) throw new Error("locked");
    fake.renames.push([a, b]);
    fake.paths.delete(a);
    fake.paths.add(b);
  },
}));

const { migrateNotesFolder } = await import("../src/lib/store.ts");

beforeEach(() => {
  fake.paths = new Set();
  fake.renames = [];
  fake.failRename = false;
});

describe("moving notes from Documents\\Marginalia to Documents\\Lorewright", () => {
  it("moves the old folder when there's no new one", async () => {
    fake.paths.add("Marginalia");
    expect(await migrateNotesFolder()).toBe("moved");
    expect(fake.renames).toEqual([["Marginalia", "Lorewright"]]);
  });

  it("does nothing for a fresh install", async () => {
    expect(await migrateNotesFolder()).toBe("none");
    expect(fake.renames).toEqual([]);
  });

  it("never overwrites an existing Lorewright folder", async () => {
    fake.paths.add("Marginalia");
    fake.paths.add("Lorewright");
    expect(await migrateNotesFolder()).toBe("kept-both");
    expect(fake.renames).toEqual([]);
  });

  it("leaves everything alone if the move fails", async () => {
    fake.paths.add("Marginalia");
    fake.failRename = true;
    expect(await migrateNotesFolder()).toBe("failed");
    expect(fake.paths.has("Marginalia")).toBe(true);
  });
});
