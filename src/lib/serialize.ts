/**
 * Serialisasi aman untuk respons JSON: BigInt → string, Prisma Decimal → number,
 * Date → ISO string. Dipakai sebelum mengembalikan data ke client.
 */
export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  // Prisma Decimal punya method toNumber / toString
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof (value as { toNumber: unknown }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}
