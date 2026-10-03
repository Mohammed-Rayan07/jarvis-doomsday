"use client";
import { getAttachments, resolveInteraction } from "@/engine/executor";
import type { StepRun } from "@/lib/types";

// Interactive Drive upload (BUILD_SPEC 3.1, §8.3). Implemented in P4:
//   dropzone / attached file → folder combobox (+ new folder, default My Drive)
//   → POST /api/drive/upload-session → XHR PUT with progress → STORED → resolve({type:'done', result})

export function UploadCard({ commandId, step }: { commandId: string; step: StepRun }) {
  const key = `${commandId}:${step.id}`;
  const files = getAttachments();
  return (
    <div className="hud-panel mt-2 p-3">
      <p className="hud-label mb-2 text-violet">Stark Archive · Upload</p>
      <p className="text-xs text-muted">
        {files.length ? `Ready: ${files.map((f) => f.name).join(", ")}` : "Upload panel is being fabricated (P4)."}
      </p>
      <button
        onClick={() =>
          resolveInteraction(key, {
            type: "done",
            result: { ok: false, message: "Drive upload isn't online yet, sir.", error: { code: "NOT_IMPLEMENTED", message: "P4" } },
          })
        }
        className="hud-label mt-2 rounded-sm border border-line px-3 py-1.5 text-muted"
      >
        Close
      </button>
    </div>
  );
}
