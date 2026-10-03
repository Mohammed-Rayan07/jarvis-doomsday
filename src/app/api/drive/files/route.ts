import { listFolder, searchFiles } from "@/lib/google/drive";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET ?folderId=… (explorer) | ?q=… (search). BUILD_SPEC §8.3
export const GET = route(async (req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  if (q) return ok(await searchFiles(q, url.searchParams.get("mimeType") ?? undefined));
  return ok(await listFolder(url.searchParams.get("folderId") ?? "root"));
});
