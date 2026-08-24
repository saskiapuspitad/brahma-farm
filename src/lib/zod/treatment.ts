import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

export const createTreatmentSchema = z.object({
  farmId: z.coerce.bigint(),
  houseId: z.coerce.bigint(),
  flockId: z.coerce.bigint(),
  categoryId: z.coerce.bigint(),
  productId: z.coerce.bigint().optional(),
  name: z.string().min(1, "Nama perlakuan wajib"),
  purpose: z.string().max(500).optional(),
  dose: z.number().min(0).optional(),
  doseUnit: z.string().max(30).optional(),
  route: z.string().max(50).optional(),
  durationDays: z.number().int().min(0).optional(),
  startDate: dateStr,
  endDate: dateStr.optional(),
  withdrawalDays: z.number().int().min(0).optional(),
  responsibleUserId: z.coerce.bigint().optional(),
  cost: z.number().min(0).optional(),
  observationNote: z.string().max(2000).optional(),
  status: z.enum(["PLANNED", "ONGOING", "COMPLETED", "CANCELLED"]).default("ONGOING"),
});
export type CreateTreatmentInput = z.infer<typeof createTreatmentSchema>;

export const updateTreatmentSchema = createTreatmentSchema.partial().omit({ farmId: true });
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentSchema>;
