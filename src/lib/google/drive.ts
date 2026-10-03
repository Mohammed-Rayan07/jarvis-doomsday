import "server-only";
import { Readable } from "node:stream";
import { drive, type drive_v3 } from "@googleapis/drive";
import type { DriveFile } from "../types";
import { errors, JarvisError } from "../errors";
import { env } from "../env";
import { getGoogleClient, mapGoogleError } from "./auth";

// BUILD_SPEC §8.3 — the Stark Archive.

export const FOLDER_MIME = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,iconLink,parents";

export function typeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    [FOLDER_MIME]: "Folder",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.form": "Google Form",
    "application/pdf": "PDF",
    "text/plain": "Text",
    "text/csv": "CSV",
    "text/markdown": "Markdown",
    "application/json": "JSON",
    "application/vnd.google-apps.shortcut": "Shortcut",
    "application/vnd.google-apps.drawing": "Google Drawing",
    "application/zip": "ZIP archive",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.ms-excel": "Excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return mimeType.split("/").pop()?.toUpperCase() ?? "File";
}

async function api() {
  return drive({ version: "v3", auth: await getGoogleClient() });
}

async function call<T>(fn: () => Promise<T>, what: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const mapped = mapGoogleError(err);
    if (mapped instanceof JarvisError) throw mapped;
    const e = err as { message?: string; status?: number; code?: number };
    const status = e.status ?? e.code;
    if (status === 404) throw new JarvisError("NOT_FOUND", `That folder or file no longer exists in the archive, sir.`, { integration: "google" });
    if (status === 403)
      throw new JarvisError("PERMISSION_DENIED", `Google Drive refused to let me ${what}. Reconnect and grant Drive access, sir.`, {
        integration: "google",
        fix: { label: "Reconnect Google", href: "/api/auth/google", action: "reconnect_google" },
      });
    if (status === 507 || /storageQuota/i.test(e.message ?? ""))
      throw new JarvisError("UPSTREAM_ERROR", "Your Drive storage is full, sir.", { integration: "google" });
    throw new JarvisError("UPSTREAM_ERROR", `I couldn't ${what}: ${e.message ?? "Google Drive error"}.`, { integration: "google" });
  }
}

function toFile(f: drive_v3.Schema$File, folderPath?: string): DriveFile {
  const mimeType = f.mimeType ?? "application/octet-stream";
  return {
    id: f.id!,
    name: f.name ?? "(untitled)",
    mimeType,
    typeLabel: typeLabel(mimeType),
    isFolder: mimeType === FOLDER_MIME,
    modifiedTime: f.modifiedTime ?? undefined,
    size: f.size ? Number(f.size) : undefined,
    webViewLink: f.webViewLink ?? undefined,
    iconLink: f.iconLink ?? undefined,
    parentId: f.parents?.[0],
    folderPath,
  };
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ── folder paths (cached per process) ────────────────────────────────

const nameCache = new Map<string, { name: string; parent?: string }>();
let rootId: string | undefined;

async function getRootId(d: drive_v3.Drive) {
  if (!rootId) rootId = (await call(() => d.files.get({ fileId: "root", fields: "id" }), "open My Drive")).data.id ?? "root";
  return rootId;
}

async function pathOf(d: drive_v3.Drive, folderId: string | undefined, depth = 0): Promise<string> {
  if (!folderId) return "Shared with me";
  const root = await getRootId(d);
  if (folderId === root || folderId === "root") return "My Drive";
  if (depth > 8) return "…";
  let node = nameCache.get(folderId);
  if (!node) {
    try {
      const res = await d.files.get({ fileId: folderId, fields: "id,name,parents" });
      node = { name: res.data.name ?? "?", parent: res.data.parents?.[0] };
    } catch {
      node = { name: "…" };
    }
    nameCache.set(folderId, node);
  }
  return `${await pathOf(d, node.parent, depth + 1)} / ${node.name}`;
}

// ── public API ───────────────────────────────────────────────────────

export async function listFolder(folderId = "root"): Promise<{ folder: DriveFile & { path: string }; items: DriveFile[] }> {
  const d = await api();
  const id = folderId === "root" ? await getRootId(d) : folderId;
  const [meta, res] = await Promise.all([
    call(() => d.files.get({ fileId: id, fields: FIELDS }), "open that folder"),
    call(
      () =>
        d.files.list({
          q: `'${esc(id)}' in parents and trashed = false`,
          orderBy: "folder,modifiedTime desc",
          pageSize: 100,
          fields: `files(${FIELDS})`,
        }),
      "list the folder",
    ),
  ]);
  const path = await pathOf(d, id);
  return { folder: { ...toFile(meta.data), name: id === rootId ? "My Drive" : (meta.data.name ?? "?"), path }, items: (res.data.files ?? []).map((f) => toFile(f)) };
}

export async function listAllFolders(): Promise<DriveFile[]> {
  const d = await api();
  const root = await getRootId(d);
  const res = await call(
    () =>
      d.files.list({
        q: `mimeType = '${FOLDER_MIME}' and trashed = false and 'me' in owners`,
        pageSize: 300,
        fields: "files(id,name,parents,modifiedTime,mimeType)",
        orderBy: "name",
      }),
    "list your folders",
  );
  const files = res.data.files ?? [];
  const byId = new Map(files.map((f) => [f.id!, f]));
  const path = (f: drive_v3.Schema$File, depth = 0): string => {
    const parent = f.parents?.[0];
    if (!parent || parent === root || depth > 8) return `My Drive / ${f.name}`;
    const p = byId.get(parent);
    return p ? `${path(p, depth + 1)} / ${f.name}` : `… / ${f.name}`;
  };
  return files.map((f) => toFile(f, path(f))).sort((a, b) => (a.folderPath ?? "").localeCompare(b.folderPath ?? ""));
}

export async function createFolder(name: string, parentId = "root"): Promise<DriveFile> {
  if (!name.trim()) throw errors.missingField("folder name", "What should I call the new folder, sir?");
  const d = await api();
  const res = await call(
    () => d.files.create({ requestBody: { name: name.trim(), mimeType: FOLDER_MIME, parents: [parentId] }, fields: FIELDS }),
    "create the folder",
  );
  return toFile(res.data, await pathOf(d, res.data.parents?.[0]));
}

const STOPWORDS = new Set(["the", "a", "an", "my", "file", "document", "doc", "for", "of", "on", "in", "to", "and", "about", "please", "jarvis", "find", "search", "drive"]);

export async function searchFiles(query: string, mimeType?: string): Promise<DriveFile[]> {
  const d = await api();
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  const base = `trashed = false${mimeType ? ` and mimeType = '${esc(mimeType)}'` : ""}`;
  const list = (q: string, ordered = true) =>
    call(
      () => d.files.list({ q: `${base} and (${q})`, pageSize: 25, fields: `files(${FIELDS})`, ...(ordered ? { orderBy: "modifiedTime desc" } : {}) }),
      "search the archive",
    ).then((r) => r.data.files ?? []);

  const terms = words.length ? words : [query.trim()];
  // 1) every keyword in the name  2) full-text phrase  3) any keyword in the name
  const [allInName, fullText] = await Promise.all([
    list(terms.map((w) => `name contains '${esc(w)}'`).join(" and ")),
    list(`fullText contains '${esc(query.trim())}'`, false).catch(() => []),
  ]);
  let results = [...allInName, ...fullText];
  if (results.length < 3 && terms.length > 1) results = [...results, ...(await list(terms.map((w) => `name contains '${esc(w)}'`).join(" or ")))];

  const seen = new Set<string>();
  const unique = results.filter((f) => f.id && !seen.has(f.id) && seen.add(f.id)).slice(0, 15);
  return Promise.all(unique.map(async (f) => toFile(f, await pathOf(d, f.parents?.[0]))));
}

/**
 * Start a resumable upload session. The browser then PUTs the bytes straight to Google
 * (real progress, no serverless body limit). Passing Origin enables CORS on the session URL.
 */
export async function createUploadSession(input: { name: string; mimeType: string; size: number; folderId?: string }): Promise<{ uploadUrl: string }> {
  if (!input.name) throw errors.missingField("file");
  const client = await getGoogleClient();
  const { token } = await client.getAccessToken();
  if (!token) throw errors.authExpired("google");
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${encodeURIComponent(FIELDS)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(input.size),
      Origin: new URL(env.appUrl).origin,
    },
    body: JSON.stringify({ name: input.name, parents: [input.folderId || "root"] }),
  });
  const uploadUrl = res.headers.get("location");
  if (!res.ok || !uploadUrl) {
    if (res.status === 401) throw errors.authExpired("google");
    if (res.status === 404) throw new JarvisError("NOT_FOUND", "That destination folder no longer exists, sir.", { integration: "google" });
    throw new JarvisError("UPSTREAM_ERROR", `Drive refused the upload (${res.status}): ${(await res.text()).slice(0, 200)}`, { integration: "google" });
  }
  return { uploadUrl };
}

/** Fallback: server-side multipart upload (used if the direct browser PUT is blocked). */
export async function uploadViaServer(file: File, folderId = "root"): Promise<DriveFile> {
  const d = await api();
  const res = await call(
    () =>
      d.files.create({
        requestBody: { name: file.name, parents: [folderId] },
        media: { mimeType: file.type || "application/octet-stream", body: Readable.fromWeb(file.stream() as never) },
        fields: FIELDS,
      }),
    "upload the file",
  );
  return toFile(res.data, await pathOf(d, res.data.parents?.[0]));
}

/** Folder path for a freshly uploaded file (client calls this after a direct upload). */
export async function describe(fileId: string): Promise<DriveFile> {
  const d = await api();
  const res = await call(() => d.files.get({ fileId, fields: FIELDS }), "verify the upload");
  return toFile(res.data, await pathOf(d, res.data.parents?.[0]));
}
