import { ok, handleError } from "@/lib/api";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { validation } from "@/lib/errors";
import { buildReport, type ReportType } from "@/services/report.service";
import { toCsv } from "@/lib/csv";
import { toExcelBuffer, toPdfBuffer } from "@/services/export.service";
import { prisma } from "@/lib/db";

// pdfkit & exceljs perlu Node runtime (bukan Edge).
export const runtime = "nodejs";

const VALID: ReportType[] = ["daily", "flock", "treatments", "mortality", "incomplete"];
const TITLES: Record<ReportType, string> = {
  daily: "Laporan Produksi Harian",
  flock: "Rekap Per Flock",
  treatments: "Riwayat Perlakuan",
  mortality: "Laporan Mortalitas & Afkir",
  incomplete: "Data Belum Lengkap",
};

type Ctx = { params: Promise<{ type: string }> };

/** GET /api/reports/:type?format=json|csv|xlsx|pdf&farmId=&flockId=&from=&to= */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "VIEW_REPORTS");
    const { type } = await params;
    if (!VALID.includes(type as ReportType)) throw validation(`Jenis laporan '${type}' tidak dikenal`);
    const rt = type as ReportType;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "json";
    const farmId = url.searchParams.get("farmId") ?? undefined;
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    const rows = await buildReport(rt, p, {
      farmId, from, to,
      flockId: url.searchParams.get("flockId") ?? undefined,
      houseId: url.searchParams.get("houseId") ?? undefined,
    });

    if (format === "json") return ok(rows, { count: rows.length });

    if (format === "csv") {
      return new Response(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="laporan-${rt}.csv"`,
        },
      });
    }

    // Metadata untuk Excel/PDF
    const farm = farmId ? await prisma.farm.findUnique({ where: { id: BigInt(farmId) } }) : null;
    const meta = {
      title: TITLES[rt],
      farmName: farm?.name,
      period: from || to ? `Periode ${from ?? "…"} s.d. ${to ?? "…"}` : undefined,
      generatedBy: p.fullName,
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };

    if (format === "xlsx") {
      const buf = await toExcelBuffer(rows, meta);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="laporan-${rt}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const buf = await toPdfBuffer(rows, meta);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="laporan-${rt}.pdf"`,
        },
      });
    }

    throw validation(`Format '${format}' tidak dikenal (gunakan json|csv|xlsx|pdf)`);
  } catch (err) {
    return handleError(err);
  }
}
