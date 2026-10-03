import "server-only";
import type { DriveFile } from "../types";
import { errors } from "../errors";

// BUILD_SPEC §8.3 — implemented in P4.

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export function typeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    [FOLDER_MIME]: "Folder",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/pdf": "PDF",
    "text/plain": "Text",
    "text/csv": "CSV",
    "application/zip": "ZIP archive",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  };
  if (map[mimeType]) return map[mimeType];
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return mimeType.split("/").pop()?.toUpperCase() ?? "File";
}

export async function listFolder(_folderId = "root"): Promise<DriveFile[]> {
  throw errors.notImplemented("Drive explorer");
}

export async function listAllFolders(): Promise<DriveFile[]> {
  throw errors.notImplemented("Drive folder picker");
}

export async function createFolder(_name: string, _parentId = "root"): Promise<DriveFile> {
  throw errors.notImplemented("Drive folder creation");
}

export async function searchFiles(_query: string, _mimeType?: string): Promise<DriveFile[]> {
  throw errors.notImplemented("Drive search");
}

export async function createUploadSession(_input: {
  name: string;
  mimeType: string;
  size: number;
  folderId?: string;
}): Promise<{ uploadUrl: string }> {
  throw errors.notImplemented("Drive upload");
}
