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

/**
 * One query for every folder (cached 2 min) instead of a files.get per ancestor per result —
 * resolving paths for 15 search hits used to cost several sequential round-trips.
 */
let folderIndexAt = 0;
let folderIndexLoad: Promise<void> | undefined;
async function loadFolderIndex(d: drive_v3.Drive) {
  if (Date.now() - folderIndexAt < 120_000) return;
  folderIndexLoad ??= (async () => {
    try {
      let pageToken: string | undefined;
      do {
        const res = await d.files.list({ q: `mimeType = '${FOLDER_MIME}' and trashed = false`, pageSize: 1000, fields: "nextPageToken,files(id,name,parents)", pageToken });
        for (const f of res.data.files ?? []) if (f.id) nameCache.set(f.id, { name: f.name ?? "?", parent: f.parents?.[0] });
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      folderIndexAt = Date.now();
    } catch {
      /* fall back to per-folder lookups */
    } finally {
      folderIndexLoad = undefined;
    }
  })();
  await folderIndexLoad;
}

async function pathOf(d: drive_v3.Drive, folderId: string | undefined, depth = 0): Promise<string> {
  if (!folderId) return "Shared with me";
  const root = await getRootId(d);
  if (folderId === root || folderId === "root") return "My Drive";
  if (depth > 8) return "…";
  let node = nameCache.get(folderId);
  // index is fresh and doesn't know this parent → it's someone else's folder we can't see
  if (!node && Date.now() - folderIndexAt < 120_000) return depth === 0 ? "Shared with me" : "Shared with me / …";
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

let allFolders: { at: number; list: DriveFile[] } | undefined;

export async function listAllFolders(): Promise<DriveFile[]> {
  if (allFolders && Date.now() - allFolders.at < 120_000) return allFolders.list; // upload-card picker
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
  const list = files.map((f) => toFile(f, path(f))).sort((a, b) => (a.folderPath ?? "").localeCompare(b.folderPath ?? ""));
  allFolders = { at: Date.now(), list };
  return list;
}

export async function createFolder(name: string, parentId = "root"): Promise<DriveFile> {
  if (!name.trim()) throw errors.missingField("folder name", "What should I call the new folder, sir?");
  const d = await api();
  const res = await call(
    () => d.files.create({ requestBody: { name: name.trim(), mimeType: FOLDER_MIME, parents: [parentId] }, fields: FIELDS }),
    "create the folder",
  );
  invalidateDriveCaches();
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
  // no orderBy: server-side sorting is markedly slower on large Drives, and we rank locally anyway
  const list = (q: string) =>
    call(() => d.files.list({ q: `${base} and (${q})`, pageSize: 25, fields: `files(${FIELDS})` }), "search the archive").then((r) => r.data.files ?? []);

  const terms = words.length ? words : [query.trim()];
  const key = `${terms.join(" ")}|${mimeType ?? ""}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.files; // the preview pane re-runs the same search

  // 1) every keyword in the name  2) any keyword in the name  3) full-text phrase (slow — capped
  //    when the name queries already found something). All in parallel with the folder index.
  const fullText = list(`fullText contains '${esc(query.trim())}'`).catch(() => []);
  const [allInName, anyInName] = await Promise.all([
    list(terms.map((w) => `name contains '${esc(w)}'`).join(" and ")),
    terms.length > 1 ? list(terms.map((w) => `name contains '${esc(w)}'`).join(" or ")).catch(() => []) : Promise.resolve([]),
    loadFolderIndex(d),
  ]);
  // full-text indexing is the slow path: give it 1 s extra when names already matched, 3 s otherwise
  const capMs = allInName.length + anyInName.length ? 1000 : 3000;
  const ft = await Promise.race([fullText, new Promise<drive_v3.Schema$File[]>((r) => setTimeout(() => r([]), capMs))]);
  // rank: keywords matched in the name (×10) + full-text hit (5), then most recently modified
  const ftIds = new Set(ft.map((f) => f.id));
  const score = (f: drive_v3.Schema$File) => {
    const name = (f.name ?? "").toLowerCase();
    // whole-word hits score highest ("mark" shouldn't rank "Marketing" first), prefix hits a little
    const whole = terms.filter((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(name)).length;
    const partial = terms.filter((w) => name.includes(w)).length;
    return whole * 10 + partial * 2 + (ftIds.has(f.id) ? 5 : 0);
  };
  const seen = new Set<string>();
  const unique = [...allInName, ...ft, ...anyInName]
    .filter((f) => f.id && !seen.has(f.id) && seen.add(f.id))
    .sort((a, b) => score(b) - score(a) || (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""))
    .slice(0, 15);
  const files = await Promise.all(unique.map(async (f) => toFile(f, await pathOf(d, f.parents?.[0]))));
  searchCache.set(key, { at: Date.now(), files });
  return files;
}

/** Build the folder index ahead of the first search (called from /api/voice/warm). */
export async function warmDrive() {
  await loadFolderIndex(await api());
}

const searchCache = new Map<string, { at: number; files: DriveFile[] }>();
/** Uploads / new folders change what a search should return. */
export function invalidateDriveCaches() {
  searchCache.clear();
  allFolders = undefined;
  folderIndexAt = 0;
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
  invalidateDriveCaches();
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
  invalidateDriveCaches(); // called right after an upload lands
  const d = await api();
  const res = await call(() => d.files.get({ fileId, fields: FIELDS }), "verify the upload");
  return toFile(res.data, await pathOf(d, res.data.parents?.[0]));
}
