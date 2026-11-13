// Report generation - runs entirely in the browser from the data already loaded.
import { CP_VERSIONS } from "@/lib/versions";
import { installedTake } from "@/lib/takes";

type Targets = Record<string, string>;

export type ReportRow = {
  client: string;
  asset: string;
  type: string;
  model: string;
  version: string;
  jhf: string;
  target: string;
  gap: number | null;      // takes behind target (0 = up to date), null = unknown
  compliance: "Up to date" | "Behind" | "Unknown";
  status: string;
  note: string;
};



export function buildRows(customers: any[], targets: Targets, errors: Record<string, string> = {}): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const c of customers) {
    for (const cl of c.clusters || []) {
      const target = Number(targets?.[cl.version]) || 0;
      const current = installedTake(cl.hotfix) || 0;
      let compliance: ReportRow["compliance"] = "Unknown";
      let gap: number | null = null;
      if (target > 0 && current > 0 && !errors?.[cl.version]) {
        gap = Math.max(0, target - current);
        compliance = gap === 0 ? "Up to date" : "Behind";
      }
      rows.push({
        client: c.name || "Unknown", asset: cl.name || "Unnamed", type: cl.clusterType || "",
        model: cl.model || "", version: cl.version || "", jhf: String(cl.hotfix || ""),
        target: target > 0 ? `Take ${target}` : "N/A", gap, compliance,
        status: cl.status || "", note: cl.note || "",
      });
    }
  }
  return rows;
}

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

export function buildCsv(rows: ReportRow[]): string {
  const head = ["Client", "Asset", "Type", "Model", "Version", "Current JHF", "Target JHF", "Takes Behind", "Compliance", "Status", "Note"];
  const q = (v: any) => {
    let raw = String(v ?? "");
    // Prevent spreadsheet formula execution when opening CSV in Excel or Sheets.
    if (/^[\s\x00-\x1f]*[=+@-]/.test(raw)) raw = "'" + raw;
    return `"${raw.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) =>
    [r.client, r.asset, r.type, r.model, r.version, r.jhf, r.target, r.gap ?? "", r.compliance, r.status, r.note].map(q).join(",")
  );
  return "\uFEFF" + [head.map(q).join(","), ...lines].join("\r\n"); // BOM so Excel reads UTF-8
}

export function buildReportHtml(opts: {
  rows: ReportRow[]; targets: Targets; targetErrors?: Record<string, string>; scopeLabel: string; generatedBy: string; logoUrl: string;
}): string {
  const { rows, targets, targetErrors = {}, scopeLabel, generatedBy, logoUrl } = opts;
  const total = rows.length;
  const ok = rows.filter((r) => r.compliance === "Up to date").length;
  const behind = rows.filter((r) => r.compliance === "Behind").length;
  const unknown = total - ok - behind;
  const pct = total ? Math.round((ok / total) * 100) : 0;
  const when = new Date().toLocaleString();

  const byClient = new Map<string, ReportRow[]>();
  rows.forEach((r) => byClient.set(r.client, [...(byClient.get(r.client) || []), r]));

  const targetCells = CP_VERSIONS.map(
    (v) => `<div class="t"><b>${esc(v.id)}</b><span>${targets?.[v.id] ? "Take " + esc(targets[v.id]) + (targetErrors?.[v.id] ? " (STALE)" : "") : "N/A"}</span></div>`
  ).join("");

  const badge = (r: ReportRow) =>
    r.compliance === "Up to date" ? `<span class="b ok">Up to date</span>`
    : r.compliance === "Behind" ? `<span class="b bad">${r.gap} behind</span>`
    : `<span class="b unk">Unknown</span>`;

  const sections = [...byClient.entries()].map(([client, list]) => `
    <h2>${esc(client)} <small>${list.length} asset${list.length === 1 ? "" : "s"}</small></h2>
    <table>
      <thead><tr><th>Asset</th><th>Type</th><th>Model</th><th>Version</th><th>Current</th><th>Target</th><th>Compliance</th><th>Status / Notes</th></tr></thead>
      <tbody>${list.map((r) => `<tr>
        <td><b>${esc(r.asset)}</b></td><td>${esc(r.type)}</td><td>${esc(r.model)}</td><td>${esc(r.version)}</td>
        <td>${esc(r.jhf)}</td><td>${esc(r.target)}</td><td>${badge(r)}</td>
        <td>${esc(r.status)}${r.note ? `<div class="n">${esc(r.note)}</div>` : ""}</td></tr>`).join("")}
      </tbody>
    </table>`).join("") || `<p>No assets in this scope.</p>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Check Point Fleet Report - ${esc(scopeLabel)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#18181b;margin:32px;font-size:12px}
  header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #ea580c;padding-bottom:12px;margin-bottom:16px}
  header img{height:44px} h1{margin:0;font-size:20px} .meta{color:#52525b;margin-top:4px}
  .sum{display:flex;gap:10px;margin:14px 0} .card{flex:1;border:1px solid #d4d4d8;border-radius:4px;padding:10px;text-align:center}
  .card b{display:block;font-size:22px} .card.ok b{color:#059669}.card.bad b{color:#dc2626}.card.unk b{color:#71717a}
  .targets{display:flex;gap:10px;margin-bottom:6px} .t{flex:1;background:#fff7ed;border:1px solid #fdba74;border-radius:4px;padding:8px;text-align:center}
  .t b{display:block;color:#c2410c}.t span{font-size:14px;font-weight:bold}
  h2{font-size:15px;margin:22px 0 6px;border-left:4px solid #ea580c;padding-left:8px} h2 small{color:#71717a;font-weight:normal;font-size:11px}
  table{width:100%;border-collapse:collapse;page-break-inside:auto} tr{page-break-inside:avoid}
  th{background:#27272a;color:#fff;text-align:left;padding:6px;font-size:11px} td{border-bottom:1px solid #e4e4e7;padding:6px;vertical-align:top}
  .n{color:#71717a;font-style:italic;margin-top:2px}
  .b{padding:2px 7px;border-radius:10px;font-weight:bold;font-size:11px;white-space:nowrap}
  .ok{background:#d1fae5;color:#065f46}.bad{background:#fee2e2;color:#991b1b}.unk{background:#e4e4e7;color:#3f3f46}
  .bar{margin-top:6px;color:#71717a;font-size:11px} .btn{position:fixed;top:12px;right:12px;background:#ea580c;color:#fff;border:0;padding:10px 16px;font-weight:bold;border-radius:4px;cursor:pointer}
  @media print{.btn{display:none} body{margin:12px}}
</style></head><body>
<button class="btn" onclick="window.print()">Print / Save as PDF</button>
<header><div><h1>Check Point Fleet Compliance Report</h1>
<div class="meta">Scope: <b>${esc(scopeLabel)}</b> &nbsp;|&nbsp; Generated: ${esc(when)} &nbsp;|&nbsp; By: ${esc(generatedBy)}</div></div>
<img src="${esc(logoUrl)}" alt="MillenniumIT ESP" onerror="this.style.display='none'"></header>
<div class="sum">
  <div class="card"><b>${total}</b>Total assets</div>
  <div class="card ok"><b>${ok}</b>On latest Take</div>
  <div class="card bad"><b>${behind}</b>Behind latest Take</div>
  <div class="card unk"><b>${unknown}</b>Unknown</div>
  <div class="card"><b>${pct}%</b>Compliance</div>
</div>
<div class="targets">${targetCells}</div>
<div class="bar">Target = last successfully retrieved published Jumbo Hotfix Take. STALE indicates a failed source check. Latest published is not necessarily the production-recommended Take. Verify with Check Point and client change management.</div>
${sections}
</body></html>`;
}
