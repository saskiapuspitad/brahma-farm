/** Error domain aplikasi dengan kode & status HTTP terpetakan. */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LOCKED"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export interface FieldError {
  field: string;
  message: string;
}

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: FieldError[];

  constructor(code: ErrorCode, message: string, details?: FieldError[]) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const notFound = (m = "Data tidak ditemukan") => new AppError("NOT_FOUND", m);
export const forbidden = (m = "Anda tidak memiliki akses") => new AppError("FORBIDDEN", m);
export const unauthenticated = (m = "Silakan login terlebih dahulu") => new AppError("UNAUTHENTICATED", m);
export const conflict = (m: string) => new AppError("CONFLICT", m);
export const locked = (m = "Data terkunci dan tidak dapat diubah") => new AppError("LOCKED", m);
export const validation = (m: string, details?: FieldError[]) => new AppError("VALIDATION_ERROR", m, details);
