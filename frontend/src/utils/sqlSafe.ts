const SUSPICIOUS =
  /('\s*(or|and)\s+['"\d]|"\s*(or|and)\s+['"\d]|'\s*=\s*'|"\s*=\s*"|--|\/\*|\*\/|;\s*(drop|delete|insert|update|alter|create|truncate|exec|execute|union)\b|union[\s\S]{0,80}select|(drop|truncate)\s+(table|database)|insert\s+into|delete\s+from|update\s+\w+\s+set|\bxp_\w+|information_schema|(sleep|benchmark)\s*\(|waitfor\s+delay)/i;

export const SQL_SAFE_MESSAGE =
  "That text is not allowed. Remove quotes used as SQL, comments, or SQL commands.";

export function isUnsafeText(value: string): boolean {
  return value.includes("\0") || SUSPICIOUS.test(value);
}

export function assertSqlSafe(value: unknown, seen = new Set<unknown>()): void {
  if (typeof value === "string") {
    if (isUnsafeText(value)) {
      throw { message: SQL_SAFE_MESSAGE, status: 400 };
    }
    return;
  }
  if (value == null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertSqlSafe(item, seen));
    return;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    assertSqlSafe(nested, seen);
  }
}
