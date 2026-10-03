import { uploadViaServer } from "@/lib/google/drive";
import { ok, route } from "@/lib/http";
import { errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Fallback multipart proxy upload when the direct-to-Google PUT is blocked (BUILD_SPEC D6).
// Note: Vercel caps request bodies at 4.5 MB, so this path is for small files / local runs.
export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw errors.missingField("file", "Select a document to upload, sir.");
  return ok(await uploadViaServer(file, (form.get("folderId") as string) || "root"));
});
