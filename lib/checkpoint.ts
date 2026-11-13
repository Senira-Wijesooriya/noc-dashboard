import { CP_VERSIONS } from "@/lib/versions";

export type TakeResult = { version: string; take: string; source: string };

/** Only count the headline latest adoption Take, never older Takes or base OS builds. */
export function parseLatestTake(html: string): number | null {
  const cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ndash;|&#8211;/gi, "–").replace(/&mdash;|&#8212;/gi, "—")
    .replace(/\s+/g, " ");
  const latestSection = cleaned.split(/Previously Released Takes|Download Archive/i)[0];
  const found = latestSection.match(/\bTake\s+(\d{1,3})\s*[-\u2013\u2014]\s*(?:Initial Adoption|Wide Adoption|Latest|Recommended)\b/i);
  const take = found ? Number(found[1]) : NaN;
  return take > 0 && take < 1000 ? take : null;
}

export async function fetchLatestTakes(): Promise<{ takes: TakeResult[]; errors: Record<string, string> }> {
  const takes: TakeResult[] = [];
  const errors: Record<string, string> = {};
  await Promise.all(CP_VERSIONS.map(async (v) => {
    try {
      const r = await fetch(v.url, { cache: "no-store", signal: AbortSignal.timeout(9000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MITESP-Shipyard/1.1)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const take = parseLatestTake(await r.text());
      if (!take) throw new Error("Latest JHF Take heading not found");
      takes.push({ version: v.id, take: String(take), source: v.url });
    } catch (error) {
      errors[v.id] = error instanceof Error ? error.message.slice(0, 80) : "Fetch failed";
    }
  }));
  return { takes, errors };
}
