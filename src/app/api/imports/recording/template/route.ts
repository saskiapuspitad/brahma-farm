import { requirePrincipal } from "@/lib/auth";
import { handleError } from "@/lib/api";
import { RECORDING_IMPORT_HEADERS } from "@/lib/zod/import";

/** GET /api/imports/recording/template — unduh template CSV. */
export async function GET(req: Request) {
  try {
    await requirePrincipal(req);
    const header = RECORDING_IMPORT_HEADERS.join(",");
    const example = "FARM01,K-01,FLK-2026-01,2026-08-20,1000,2,1,0,0,800,20,5,20,5,51.0,110.0,7500";
    const csv = `${header}\n${example}\n`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="template-recording.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
