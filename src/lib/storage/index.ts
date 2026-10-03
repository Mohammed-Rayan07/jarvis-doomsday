import "server-only";
import { env } from "../env";
import { jsonAdapter } from "./json";

// Tiny collection store. JSON files locally; Upstash Redis on Vercel (BUILD_SPEC §8.6).

export interface StorageAdapter {
  kind: "json" | "redis";
  getAll<T>(collection: string): Promise<T[]>;
  get<T>(collection: string, id: string): Promise<T | undefined>;
  put<T extends { id: string }>(collection: string, item: T): Promise<T>;
  remove(collection: string, id: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
}

export const COLLECTIONS = {
  reminders: "reminders",
  contacts: "contacts",
  comms: "comms",
  actions: "actions",
} as const;

let adapter: StorageAdapter | undefined;

export function storage(): StorageAdapter {
  if (adapter) return adapter;
  // TODO(P8): redis adapter when env.upstashUrl && env.upstashToken
  void env;
  adapter = jsonAdapter;
  return adapter;
}
