/** Returns the violated constraint name if err is a Postgres unique violation, else null. */
export function uniqueViolation(err: unknown): string | null {
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "23505") {
    return String((err as { constraint?: unknown }).constraint ?? "");
  }
  return null;
}
