"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, FolderPlus, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";
import { getAttachments, resolveInteraction } from "@/engine/executor";
import type { DriveFile, JarvisErrorShape, StepRun, ToolResult } from "@/lib/types";
import { cn } from "@/lib/cn";
import { usePreview } from "@/store/preview";

// Interactive Drive upload (BUILD_SPEC 3.1, §8.3):
//   file (attached / picked / dropped) → destination (existing folder | new folder | My Drive)
//   → resumable session → XHR PUT direct to Google with live progress → verify → STORED.

type Phase = "select" | "preparing" | "uploading" | "verifying" | "stored" | "error";

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

const NEW = "__new__";
const ROOT = "root";

export function UploadCard({ commandId, step }: { commandId: string; step: StepRun }) {
  const key = `${commandId}:${step.id}`;
  const hint = step.args as { folderName?: string; createFolder?: boolean };

  const [file, setFile] = useState<File | undefined>(() => getAttachments()[0]);
  const [folders, setFolders] = useState<DriveFile[]>();
  const [foldersError, setFoldersError] = useState<string>();
  const [dest, setDest] = useState<string>(ROOT);
  const [newName, setNewName] = useState(hint.folderName ?? "");
  const [phase, setPhase] = useState<Phase>("select");
  const [progress, setProgress] = useState({ loaded: 0, total: 0, speed: 0 });
  const [error, setError] = useState<JarvisErrorShape>();
  const [stored, setStored] = useState<DriveFile>();
  const [dragging, setDragging] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Show the live Drive explorer beside the card while Tony picks a destination (3.1).
  useEffect(() => {
    if (usePreview.getState().tab !== "drive") usePreview.getState().focus({ tab: "drive" });
  }, []);

  // Load folders for the picker and pre-select from the command ("…to my Reactor folder").
  useEffect(() => {
    fetch("/api/drive/folders")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setFoldersError(j.error?.message ?? "Couldn't load folders");
        const list = j.data as DriveFile[];
        setFolders(list);
        if (hint.folderName) {
          const match = list.find((f) => f.name.toLowerCase() === hint.folderName!.toLowerCase());
          setDest(match && !hint.createFolder ? match.id : NEW);
        } else if (hint.createFolder) setDest(NEW);
      })
      .catch(() => setFoldersError("Network link lost"));
  }, [hint.folderName, hint.createFolder]);

  const destLabel = useMemo(() => {
    if (dest === ROOT) return "My Drive";
    if (dest === NEW) return `My Drive / ${newName || "new folder"}`;
    return folders?.find((f) => f.id === dest)?.folderPath ?? "folder";
  }, [dest, newName, folders]);

  const finish = (result: ToolResult) => resolveInteraction(key, { type: "done", result });

  const fail = (e: JarvisErrorShape) => {
    setError(e);
    setPhase("error");
  };

  async function start() {
    if (!file) return fail({ code: "MISSING_FIELD", message: "Select a document first, sir." });
    if (dest === NEW && !newName.trim()) return fail({ code: "MISSING_FIELD", message: "Name the new folder, sir." });
    setError(undefined);
    setPhase("preparing");

    try {
      // 1. destination
      let folderId = dest;
      let folderPath = destLabel;
      if (dest === NEW) {
        const r = await fetch("/api/drive/folders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: newName.trim() }),
        }).then((x) => x.json());
        if (!r.ok) return fail(r.error);
        folderId = r.data.id;
        folderPath = r.data.folderPath ? `${r.data.folderPath} / ${r.data.name}` : `My Drive / ${r.data.name}`;
        setFolders((f) => [...(f ?? []), { ...r.data, folderPath }]);
        setDest(folderId);
      }

      // 2. resumable session (server) → 3. direct PUT with progress (browser)
      const session = await fetch("/api/drive/upload-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, folderId }),
      }).then((x) => x.json());
      if (!session.ok) return fail(session.error);

      setPhase("uploading");
      let uploaded: { id: string } | undefined;
      try {
        uploaded = await putWithProgress(session.data.uploadUrl, file);
      } catch (err) {
        if ((err as Error).name === "AbortError") return fail({ code: "CANCELLED", message: "Upload cancelled, sir." });
        // CORS / network on the direct path → server proxy fallback
        setProgress({ loaded: 0, total: file.size, speed: 0 });
        const form = new FormData();
        form.append("file", file);
        form.append("folderId", folderId);
        const r = await fetch("/api/drive/upload", { method: "POST", body: form }).then((x) => x.json());
        if (!r.ok) return fail(r.error);
        uploaded = r.data;
      }

      // 4. verify it actually landed in Drive
      setPhase("verifying");
      const v = await fetch(`/api/drive/files?id=${uploaded!.id}`).then((x) => x.json());
      if (!v.ok) return fail(v.error);
      const f = v.data as DriveFile;
      setStored(f);
      setPhase("stored");
      finish({
        ok: true,
        data: f,
        message: `"${f.name}" is stored in ${f.folderPath ?? folderPath}, sir.`,
        preview: { tab: "drive", highlightId: f.id, folderId: f.parentId ?? folderId },
      });
    } catch (err) {
      fail({ code: "NETWORK", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }

  function putWithProgress(url: string, f: File) {
    return new Promise<{ id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      const t0 = performance.now();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", f.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        const secs = (performance.now() - t0) / 1000;
        setProgress({ loaded: e.loaded, total: e.total || f.size, speed: secs > 0 ? e.loaded / secs : 0 });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(Object.assign(new Error(`Drive returned ${xhr.status}`), { name: "HttpError" }));
      };
      xhr.onerror = () => reject(Object.assign(new Error("Network/CORS error"), { name: "NetworkError" }));
      xhr.onabort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      xhr.send(f);
    });
  }

  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const busy = phase === "preparing" || phase === "uploading" || phase === "verifying";

  return (
    <div className="hud-panel mt-2 p-3" style={{ ["--primary" as string]: "var(--violet)" }}>
      <p className="hud-label mb-3 flex items-center gap-2 text-violet">
        <UploadCloud className="size-3.5" /> Stark Archive · Upload
      </p>

      {/* file */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        }}
        onClick={() => !busy && phase !== "stored" && picker.current?.click()}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-sm border border-dashed px-3 py-3 text-sm transition-colors",
          dragging ? "border-violet bg-violet/10" : "border-violet/40 hover:border-violet",
          (busy || phase === "stored") && "cursor-default",
        )}
      >
        <FileUp className="size-5 shrink-0 text-violet" />
        {file ? (
          <span className="min-w-0">
            <span className="block truncate">{file.name}</span>
            <span className="font-mono text-[0.65rem] text-muted">
              {fmtBytes(file.size)} · {file.type || "unknown type"}
            </span>
          </span>
        ) : (
          <span className="text-muted">Drop a document here or click to choose one from your device</span>
        )}
        <input ref={picker} type="file" hidden onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
      </div>

      {/* destination */}
      <label className="mt-3 block text-xs">
        <span className="hud-label mb-1 block text-[0.55rem] text-muted">Destination</span>
        <select
          value={dest}
          disabled={busy || phase === "stored"}
          onChange={(e) => setDest(e.target.value)}
          className="w-full rounded-sm border border-line bg-black/50 px-2 py-1.5 font-mono text-text outline-none focus:border-violet"
        >
          <option value={ROOT}>My Drive (default)</option>
          {folders?.map((f) => (
            <option key={f.id} value={f.id}>
              {f.folderPath}
            </option>
          ))}
          <option value={NEW}>＋ New folder…</option>
        </select>
        {!folders && !foldersError && <span className="mt-1 block text-[0.65rem] text-muted">Loading folders…</span>}
        {foldersError && <span className="mt-1 block text-[0.65rem] text-red">{foldersError}</span>}
      </label>
      {dest === NEW && (
        <label className="mt-2 flex items-center gap-2 text-xs">
          <FolderPlus className="size-4 text-violet" />
          <input
            autoFocus
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New folder name (in My Drive)"
            className="w-full rounded-sm border border-line bg-black/50 px-2 py-1.5 font-mono outline-none focus:border-violet"
          />
        </label>
      )}

      {/* progress / status */}
      {phase !== "select" && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={cn("hud-label text-[0.6rem]", phase === "error" ? "text-red" : phase === "stored" ? "text-primary" : "text-violet")}>
              {phase === "preparing" && "Preparing uplink…"}
              {phase === "uploading" && (pct < 100 ? `Uploading · ${pct}%` : "Finalising in Drive…")}
              {phase === "verifying" && "Verifying in Drive…"}
              {phase === "stored" && "Stored in the archive"}
              {phase === "error" && (error?.code === "CANCELLED" ? "Cancelled" : "Upload failed")}
            </span>
            {phase === "uploading" && (
              <span className="font-mono text-[0.65rem] text-muted">
                {fmtBytes(progress.loaded)} / {fmtBytes(progress.total)} · {fmtBytes(progress.speed)}/s
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className={cn("h-full transition-[width] duration-200", phase === "error" ? "bg-red" : phase === "stored" ? "bg-primary" : "bg-violet")}
              style={{ width: `${phase === "stored" || phase === "verifying" ? 100 : phase === "preparing" ? 4 : pct}%`, boxShadow: "0 0 10px currentColor" }}
            />
          </div>
          {phase === "error" && error && <p className="mt-2 text-xs text-red">{error.message}</p>}
          {phase === "stored" && stored && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-primary">
              <CheckCircle2 className="size-3.5" /> {stored.name} → {stored.folderPath}
              {stored.webViewLink && (
                <a href={stored.webViewLink} target="_blank" rel="noreferrer" className="ml-auto text-cyan underline">
                  Open in Drive
                </a>
              )}
            </p>
          )}
        </div>
      )}

      {/* actions */}
      {phase !== "stored" && (
        <div className="mt-3 flex gap-2">
          {(phase === "select" || phase === "error") && (
            <button
              onClick={start}
              disabled={!file}
              className="hud-label flex items-center gap-1.5 rounded-sm border border-violet bg-violet/10 px-3 py-1.5 text-violet hover:bg-violet/20 disabled:opacity-40"
            >
              {phase === "error" ? <RotateCcw className="size-3.5" /> : <UploadCloud className="size-3.5" />}
              {phase === "error" ? "Retry" : "Upload to Drive"}
            </button>
          )}
          {phase === "uploading" && (
            <button onClick={() => xhrRef.current?.abort()} className="hud-label flex items-center gap-1 rounded-sm border border-red/50 px-3 py-1.5 text-red">
              <X className="size-3.5" /> Cancel upload
            </button>
          )}
          {busy && phase !== "uploading" && <Loader2 className="size-4 animate-spin text-violet" />}
          {!busy && (
            <button
              onClick={() =>
                finish({
                  ok: false,
                  message: error?.message ?? "Upload abandoned, sir.",
                  error: error ?? { code: "CANCELLED", message: "Upload abandoned, sir." },
                })
              }
              className="hud-label ml-auto rounded-sm border border-line px-3 py-1.5 text-muted hover:text-text"
            >
              {phase === "error" ? "Give up" : "Cancel"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
