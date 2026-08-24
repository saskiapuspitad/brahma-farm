import { z } from "zod";

export const importCsvSchema = z.object({
  csv: z.string().min(1, "CSV kosong"),
  commit: z.boolean().optional(), // false = preview saja
});
export type ImportCsvInput = z.infer<typeof importCsvSchema>;

/** Kolom template impor recording lama. */
export const RECORDING_IMPORT_HEADERS = [
  "farm_code", "house_code", "flock_code", "record_date",
  "opening_population", "mortality", "culling", "transfer_in", "transfer_out",
  "whole_eggs", "cracked_eggs", "broken_eggs", "dirty_eggs", "abnormal_eggs",
  "total_weight_kg", "feed_consumed_kg", "price_per_kg",
] as const;
