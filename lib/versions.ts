// Official Check Point Jumbo Hotfix Downloads pages (not older /Rxx/Rxx/*.htm mirrors).
export type CpVersion = { id: string; url: string; warnGap: number };
const BASE = "https://sc1.checkpoint.com/documents/Jumbo_HFA";
export const CP_VERSIONS: CpVersion[] = [
  { id: "R81.20", url: `${BASE}/R81.20/Downloads.html`, warnGap: 20 },
  { id: "R82", url: `${BASE}/R82/Downloads.html`, warnGap: 20 },
  { id: "R82.10", url: `${BASE}/R82.10/Downloads.html`, warnGap: 10 },
  { id: "R82.20", url: `${BASE}/R82.20/Downloads.html`, warnGap: 5 },
];
export const VERSION_IDS = CP_VERSIONS.map((v) => v.id);
export const DEFAULT_VERSION = "R81.20";
