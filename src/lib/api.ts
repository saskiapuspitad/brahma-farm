import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, type FieldError } from "./errors";

/** Amplop respons konsisten (lihat DESIGN.md §6). */
export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, data, ...(meta ? { meta } : {}) }, { status });
}

export function created<T>(data: T) {
  return ok(data, undefined, 201);
}

export function fail(code: string, message: string, status: number, details?: FieldError[]) {
  return NextResponse.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

/** Ubah error apa pun menjadi respons aman (tanpa membocorkan stacktrace). */
export function handleError(err: unknown) {
  if (err instanceof AppError) {
    return fail(err.code, err.message, err.status, err.details);
  }
  if (err instanceof ZodError) {
    const details: FieldError[] = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));
    return fail("VALIDATION_ERROR", "Data tidak valid", 422, details);
  }
  // Prisma unique violation
  if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
    return fail("CONFLICT", "Data sudah ada (duplikat)", 409);
  }
  console.error("[UNHANDLED]", err);
  return fail("INTERNAL", "Terjadi kesalahan pada server", 500);
}
