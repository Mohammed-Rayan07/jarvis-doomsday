import { createFolder, listAllFolders } from "@/lib/google/drive";
import { ok, route } from "@/lib/http";
import { errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok(await listAllFolders()));

export const POST = route(async (req: Request) => {
  const { name, parentId } = (await req.json()) as { name?: string; parentId?: string };
  if (!name?.trim()) throw errors.missingField("folder name", "What should I call the new folder, sir?");
  return ok(await createFolder(name.trim(), parentId));
});
