import { executeTool } from "@/lib/tools/registry";
import { TOOL_NAMES, type ExecuteRequest } from "@/lib/types";
import { failure, JarvisError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as ExecuteRequest;
  if (!TOOL_NAMES.includes(body.tool)) {
    return Response.json(failure(new JarvisError("VALIDATION", `Unknown tool: ${body.tool}`)), { status: 400 });
  }
  const result = await executeTool(body.tool, body.args, { tz: body.tz || "Asia/Kolkata", commandId: body.commandId });
  return Response.json(result);
}
