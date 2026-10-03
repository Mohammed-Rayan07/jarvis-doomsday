import { route } from "@/lib/http";
import { errors } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Fallback multipart proxy upload when direct-to-Google PUT fails (CORS). Implemented in P4.
export const POST = route(async () => {
  throw errors.notImplemented("Proxy upload");
});
