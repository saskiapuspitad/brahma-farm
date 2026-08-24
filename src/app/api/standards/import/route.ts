import { prisma } from "@/lib/db";
import { ok, handleError } from "@/lib/api";
import { requirePrincipal } from "@/lib/auth";
import { requireAbility } from "@/lib/rbac";
import { parseCsv } from "@/lib/csv";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const bodySchema = z.object({ csv: z.string().min(1) });

const D = (s: string) => (s === "" || s == null ? null : new Prisma.Decimal(Number(s)));

/**
 * POST /api/standards/import — impor CSV standar performa (Super Admin).
 * Header: strain_code,age_week,hdp_target,feed_intake_target_g,egg_weight_target_g,
 *         egg_mass_target_g,fcr_target,body_weight_target_g,max_mortality_pct,source_label
 */
export async function POST(req: Request) {
  try {
    const p = await requirePrincipal(req);
    requireAbility(p, "MANAGE_STANDARDS");
    const { csv } = bodySchema.parse(await req.json());
    const rows = parseCsv(csv);

    const strains = await prisma.strain.findMany({ select: { id: true, code: true } });
    const byCode = new Map(strains.map((s) => [s.code, s.id]));

    let success = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const strainId = byCode.get(r.strain_code);
      const ageWeek = Number(r.age_week);
      if (!strainId) { errors.push({ row: i + 2, message: `strain_code '${r.strain_code}' tidak dikenal` }); continue; }
      if (!Number.isInteger(ageWeek) || ageWeek < 0) { errors.push({ row: i + 2, message: "age_week tidak valid" }); continue; }
      if (!r.source_label) { errors.push({ row: i + 2, message: "source_label wajib diisi" }); continue; }
      try {
        await prisma.performanceStandard.upsert({
          where: { strainId_ageWeek: { strainId, ageWeek } },
          create: {
            strainId, ageWeek, hdpTarget: D(r.hdp_target), feedIntakeTargetG: D(r.feed_intake_target_g),
            eggWeightTargetG: D(r.egg_weight_target_g), eggMassTargetG: D(r.egg_mass_target_g),
            fcrTarget: D(r.fcr_target), bodyWeightTargetG: D(r.body_weight_target_g),
            maxMortalityPct: D(r.max_mortality_pct), sourceLabel: r.source_label,
          },
          update: {
            hdpTarget: D(r.hdp_target), feedIntakeTargetG: D(r.feed_intake_target_g),
            eggWeightTargetG: D(r.egg_weight_target_g), eggMassTargetG: D(r.egg_mass_target_g),
            fcrTarget: D(r.fcr_target), bodyWeightTargetG: D(r.body_weight_target_g),
            maxMortalityPct: D(r.max_mortality_pct), sourceLabel: r.source_label,
          },
        });
        success++;
      } catch {
        errors.push({ row: i + 2, message: "gagal menyimpan baris" });
      }
    }

    await prisma.importHistory.create({
      data: {
        userId: BigInt(p.userId), importType: "STANDARD", fileName: "standards.csv",
        totalRows: rows.length, successRows: success, failedRows: errors.length,
        status: errors.length === rows.length ? "FAILED" : "DONE", finishedAt: new Date(),
      },
    });

    return ok({ totalRows: rows.length, successRows: success, failedRows: errors.length, errors });
  } catch (err) {
    return handleError(err);
  }
}
