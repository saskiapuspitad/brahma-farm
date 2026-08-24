import { z } from "zod";

export const createHouseSchema = z.object({
  farmId: z.coerce.bigint(),
  code: z.string().min(1, "Kode kandang wajib"),
  name: z.string().min(1, "Nama kandang wajib"),
  houseType: z.enum(["BATTERY", "POSTAL", "CAGE_FREE", "OTHER"]).default("BATTERY"),
  capacity: z.number().int().min(0).optional(),
  location: z.string().max(200).optional(),
  responsibleUserId: z.coerce.bigint().optional(),
});
export type CreateHouseInput = z.infer<typeof createHouseSchema>;

export const updateHouseSchema = createHouseSchema.partial().omit({ farmId: true });
export type UpdateHouseInput = z.infer<typeof updateHouseSchema>;

export const setHouseStatusSchema = z.object({
  status: z.enum(["EMPTY", "ACTIVE", "SANITATION", "INACTIVE"]),
});

export const createFarmSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  ownerName: z.string().max(100).optional(),
});
export type CreateFarmInput = z.infer<typeof createFarmSchema>;
