import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageAdapter } from "./index";

// Vercel's filesystem is read-only except /tmp (ephemeral) — degrade instead of crashing.
const DATA_DIR = process.env.VERCEL ? path.join("/tmp", "jarvis-data") : path.join(process.cwd(), ".data");

// Serialise writes per file so rapid queued commands can't clobber each other.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

async function readFile<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeFile(name: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `${name}.json`);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(data, null, 2));
  await fs.rename(`${file}.tmp`, file);
}

export const jsonAdapter: StorageAdapter = {
  kind: "json",
  getAll: <T>(c: string) => readFile<T[]>(c, []),
  async get<T>(c: string, id: string) {
    const all = await readFile<(T & { id: string })[]>(c, []);
    return all.find((x) => x.id === id) as T | undefined;
  },
  put: <T extends { id: string }>(c: string, item: T) =>
    withLock(c, async () => {
      const all = await readFile<T[]>(c, []);
      const i = all.findIndex((x) => x.id === item.id);
      if (i >= 0) all[i] = item;
      else all.push(item);
      await writeFile(c, all);
      return item;
    }),
  remove: (c: string, id: string) =>
    withLock(c, async () => {
      const all = await readFile<{ id: string }[]>(c, []);
      await writeFile(
        c,
        all.filter((x) => x.id !== id),
      );
    }),
  async getMeta<T>(key: string) {
    const meta = await readFile<Record<string, unknown>>("_meta", {});
    return meta[key] as T | undefined;
  },
  setMeta: <T>(key: string, value: T) =>
    withLock("_meta", async () => {
      const meta = await readFile<Record<string, unknown>>("_meta", {});
      meta[key] = value;
      await writeFile("_meta", meta);
    }),
};
