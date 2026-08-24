import { z } from "zod";

/** Skema validasi input recording — dipakai FE (form) & BE (route). */

const nonNegInt = z.number().int().min(0, "Tidak boleh negatif");
const nonNegNum = z.number().min(0, "Tidak boleh negatif");

export const populationInput = z.object({
  openingPopulation: nonNegInt,
  mortality: nonNegInt.default(0),
  culling: nonNegInt.default(0),
  transferIn: nonNegInt.default(0),
  transferOut: nonNegInt.default(0),
});

export const eggInput = z.object({
  wholeEggs: nonNegInt.default(0),
  crackedEggs: nonNegInt.default(0),
  brokenEggs: nonNegInt.default(0),
  dirtyEggs: nonNegInt.default(0),
  abnormalEggs: nonNegInt.default(0),
  totalWeightKg: nonNegNum.default(0),
  sampleWeightG: nonNegNum.optional(),
  trays: nonNegInt.optional(),
});

export const feedInput = z.object({
  feedTypeId: z.coerce.bigint().optional(),
  openingStockKg: nonNegNum.default(0),
  feedInKg: nonNegNum.default(0),
  feedGivenKg: nonNegNum.default(0),
  feedLeftoverKg: nonNegNum.default(0),
  feedConsumedKg: nonNegNum.default(0),
  batchCode: z.string().max(50).optional(),
  pricePerKg: nonNegNum.optional(),
});

export const waterInput = z
  .object({ waterConsumptionL: nonNegNum.optional(), note: z.string().max(500).optional() })
  .optional();

export const environmentInput = z
  .object({
    tempMin: z.number().optional(),
    tempMax: z.number().optional(),
    tempAvg: z.number().optional(),
    humidityPct: z.number().min(0).max(100).optional(),
    thi: z.number().optional(),
    lightHours: z.number().min(0).max(24).optional(),
    ventilationNote: z.string().max(500).optional(),
    weatherNote: z.string().max(500).optional(),
  })
  .optional();

export const createRecordingSchema = z.object({
  houseId: z.coerce.bigint(),
  flockId: z.coerce.bigint(),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  population: populationInput,
  eggs: eggInput,
  feed: feedInput,
  water: waterInput,
  environment: environmentInput,
  generalNote: z.string().max(2000).optional(),
  // Untuk menyimpan nilai tak wajar dengan otorisasi (admin) + alasan (audit).
  force: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export type CreateRecordingInput = z.infer<typeof createRecordingSchema>;

export const correctRecordingSchema = createRecordingSchema
  .partial({ houseId: true, flockId: true, recordDate: true })
  .extend({ reason: z.string().min(3, "Alasan koreksi wajib diisi") });

export type CorrectRecordingInput = z.infer<typeof correctRecordingSchema>;
