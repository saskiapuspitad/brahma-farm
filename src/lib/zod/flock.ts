import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const createFlockSchema = z.object({
  farmId: z.coerce.bigint(),
  houseId: z.coerce.bigint(),
  code: z.string().min(1, "Kode flock wajib"),
  strainId: z.coerce.bigint(),
  sourceSupplier: z.string().max(200).optional(),
  hatchDate: dateStr,
  entryDate: dateStr,
  initialPopulation: z.number().int().min(0),
  rearingType: z.enum(["PULLET_REARED", "DOC"]).default("PULLET_REARED"),
  productionPhase: z.enum(["PRE_LAY", "EARLY_LAY", "PEAK", "LATE_LAY", "SPENT"]).default("PRE_LAY"),
  targetProductionNote: z.string().max(500).optional(),
  plannedCullDate: dateStr.optional(),
  notes: z.string().max(2000).optional(),
  // Bila true, langsung aktifkan (buat assignment + set kandang ACTIVE).
  activate: z.boolean().optional(),
});
export type CreateFlockInput = z.infer<typeof createFlockSchema>;

export const updateFlockSchema = createFlockSchema
  .partial()
  .omit({ farmId: true, activate: true });
export type UpdateFlockInput = z.infer<typeof updateFlockSchema>;

export const completeFlockSchema = z.object({
  status: z.enum(["COMPLETED", "CULLED"]),
  actualCullDate: dateStr.optional(),
  reason: z.string().max(500).optional(),
});
export type CompleteFlockInput = z.infer<typeof completeFlockSchema>;
