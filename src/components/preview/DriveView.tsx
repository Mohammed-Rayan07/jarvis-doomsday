"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Presentation,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { usePreview } from "@/store/preview";
import { useFeed } from "@/hooks/useFeed";
import { submit } from "@/engine/executor";
import type { DriveFile } from "@/lib/types";
import { cn } from "@/lib/cn";
import { FeedError, FeedLoading } from "./FeedState";

// Live Drive preview (BUILD_SPEC 3.1 / 3.2): breadcrumb explorer + search results showing
// name, type, folder location, last modified and an open link.

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "2-digit", hour: "numeric", minute: "2-digit" }) : "—";
const fmtBytes = (n?: number) =>
  n === undefined ? "" : n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

function FileIcon({ f }: { f: DriveFile }) {
  const cls = "size-4 shrink-0";
  if (f.isFolder) return <Folder className={cn(cls, "text-violet")} fill="currentColor" fillOpacity={0.2} />;
  if (f.typeLabel === "Image") return <FileImage className={cn(cls, "text-cyan")} />;
  if (/Sheet|Excel|CSV/.test(f.typeLabel)) return <FileSpreadsheet className={cn(cls, "text-primary")} />;
  if (/Slides|PowerPoint/.test(f.typeLabel)) return <Presentation className={cn(cls, "text-gold")} />;
  if (/Doc|Word|PDF|Text|Markdown/.test(f.typeLabel)) return <FileText className={cn(cls, f.typeLabel === "PDF" ? "text-red" : "text-telegram")} />;
  return <File className={cn(cls, "text-muted")} />;
}

export function DriveView() {
  const version = usePreview((s) => s.version.drive);
  const mode = usePreview((s) => s.driveMode);
  const query = usePreview((s) => s.driveQuery);
  const folderId = usePreview((s) => s.driveFolderId) ?? "root";
  const highlightId = usePreview((s) => s.highlightId);
  const openFolder = usePreview((s) => s.openFolder);
  const exitSearch = usePreview((s) => s.exitSearch);
  const focus = usePreview((s) => s.focus);
  const [history, setHistory] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");

  const searching = mode === "search" && !!query;
  const listing = useFeed<{ folder: DriveFile & { path: string }; items: DriveFile[] }>(
    searching ? null : `/api/drive/files?folderId=${encodeURIComponent(folderId)}`,
    version,
  );
  const results = useFeed<DriveFile[]>(searching ? `/api/drive/files?q=${encodeURIComponent(query!)}` : null, version);

  const go = (id: string) => {
    setHistory((h) => [...h, folderId]);
    openFolder(id);
  };
  const back = () => {
    const prev = history.at(-1);
    setHistory((h) => h.slice(0, -1));
    openFolder(prev ?? "root");
  };

  const feed = searching ? results : listing;
  const items = searching ? results.data : listing.data?.items;

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-line bg-black/40 px-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (searchText.trim()) focus({ tab: "drive", mode: "search", query: searchText.trim() });
          }}
        >
          <Search className="size-3.5 text-muted" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search the Stark Archive…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted/70"
            aria-label="Search Drive"
          />
        </form>
        <button
          onClick={() => submit("Upload a document to my Drive")}
          className="hud-label flex items-center gap-1.5 rounded-sm border border-violet/60 px-2.5 py-1.5 text-[0.6rem] text-violet hover:bg-violet/10"
        >
          <UploadCloud className="size-3.5" /> Upload
        </button>
      </div>

      {/* location bar */}
      <div className="flex items-center gap-2 text-xs">
        {searching ? (
          <>
            <span className="hud-label text-violet">Search results</span>
            <span className="truncate font-mono text-muted">&ldquo;{query}&rdquo; · {results.data?.length ?? "…"} found</span>
            <button
              onClick={() => {
                exitSearch();
                setSearchText("");
              }}
              className="ml-auto flex items-center gap-1 text-muted hover:text-text"
            >
              <X className="size-3" /> Clear
            </button>
          </>
        ) : (
          <>
            {folderId !== "root" && listing.data?.folder.path !== "My Drive" && (
              <button onClick={back} aria-label="Back" className="text-muted hover:text-violet">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <FolderOpen className="size-4 text-violet" />
            <span className="truncate font-mono text-muted">{listing.data?.folder.path ?? "My Drive"}</span>
            <span className="ml-auto font-mono text-muted">{listing.data ? `${listing.data.items.length} items` : ""}</span>
          </>
        )}
      </div>

      {/* body */}
      {feed.loading && !items ? (
        <FeedLoading label={searching ? "Scanning the archive…" : "Opening the archive…"} />
      ) : feed.error && !items ? (
        <FeedError error={feed.error} onRetry={feed.reload} />
      ) : !items?.length ? (
        <p className="py-10 text-center text-sm text-muted">{searching ? "No matching files, sir." : "This folder is empty."}</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-sm border border-line">
          {items.map((f) => (
            <li
              key={f.id}
              className={cn("flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02]", f.isFolder && "cursor-pointer", highlightId === f.id && "highlight-pulse")}
              style={{ ["--hl" as string]: "var(--violet)" }}
              onClick={() => f.isFolder && go(f.id)}
            >
              <FileIcon f={f} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{f.name}</p>
                <p className="truncate font-mono text-[0.65rem] text-muted">
                  {f.typeLabel}
                  {f.size !== undefined && ` · ${fmtBytes(f.size)}`}
                  {searching && f.folderPath && <span className="text-violet/80"> · 📁 {f.folderPath}</span>}
                </p>
              </div>
              <span className="hidden shrink-0 font-mono text-[0.65rem] text-muted sm:block" title="Last modified">
                {fmtDate(f.modifiedTime)}
              </span>
              {f.webViewLink && (
                <a
                  href={f.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open ${f.name} in Google Drive`}
                  className="text-muted hover:text-cyan"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
