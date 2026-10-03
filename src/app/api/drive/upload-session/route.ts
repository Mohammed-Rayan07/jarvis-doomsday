import { createUploadSession } from "@/lib/google/drive";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

// Creates a resumable upload session; the browser PUTs the file straight to Google (BUILD_SPEC D6).
export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { name: string; mimeType: string; size: number; folderId?: string };
  return ok(await createUploadSession(body));
});
