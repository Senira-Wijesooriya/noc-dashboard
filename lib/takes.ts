/** Installed JHF Take only; do not mistake a version, build number, or portfix for JHF. */
export function installedTake(value: unknown): number | null {
  const text = String(value ?? "").trim();
  const match = text.match(/\bTake\s*[:#-]?\s*(\d{1,3})\b/i) || text.match(/^\d{1,3}$/);
  const take = match ? Number(match[1] ?? match[0]) : NaN;
  return Number.isInteger(take) && take > 0 ? take : null;
}
