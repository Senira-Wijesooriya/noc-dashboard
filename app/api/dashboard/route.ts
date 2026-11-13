import { NextResponse } from "next/server";
import kv from "@/lib/redis";
import { CP_VERSIONS, VERSION_IDS } from "@/lib/versions";
import { fetchLatestTakes } from "@/lib/checkpoint";
import { getSession, isSameOrigin, requesterIp } from "@/lib/security";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Keep the existing live Vercel KV database and key names. Never seed test customer data.
const CK = "data:customers", LK = "data:logs", RK = "data:recycle", VK = "data:revision";
const MAX_HISTORY = 200;
type Asset = { id: string; name: string; version: string; hotfix: string; model: string; clusterType: string; status: string; note: string };
type Customer = { id: string; name: string; clusters: Asset[] };
type Change = { kind: string; customerId: string; customerName: string; clusterId?: string; clusterName?: string; before: unknown; after: unknown };
type RecycleEntry = Change & { id: string; userEmail: string; userName: string; ipAddress: string; timestamp: number; restoredAt: number | null; restoredBy: string | null };
type Audit = { id: string; userEmail: string; userName: string; ipAddress: string; description: string; timestamp: number };
const describe: Record<string, string> = {
  add_client: "Added client", delete_client: "Deleted client", add_cluster: "Added asset", edit_cluster: "Updated asset", delete_cluster: "Deleted asset"
};
const response = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const unpack = <T,>(raw: unknown, fallback: T): T => {
  if (raw == null) return fallback;
  try { return (typeof raw === "string" ? JSON.parse(raw) : raw) as T; } catch { return fallback; }
};
async function state() {
  const [customers, logs, recycle, revision] = await Promise.all([kv.get(CK), kv.get(LK), kv.get(RK), kv.get(VK)]);
  return {
    customers: unpack<Customer[]>(customers, []), logs: unpack<Audit[]>(logs, []),
    recycle: unpack<RecycleEntry[]>(recycle, []), revision: Number(revision || 0),
  };
}
function validate(list: unknown): list is Customer[] {
  if (!Array.isArray(list) || list.length > 1500) return false;
  const clientIds = new Set();
  for (const c of list) {
    if (!c || typeof c.id !== "string" || c.id.length > 100 || clientIds.has(c.id) ||
        typeof c.name !== "string" || !c.name.trim() || c.name.length > 160 ||
        !Array.isArray(c.clusters) || c.clusters.length > 1500) return false;
    clientIds.add(c.id);
    const assetIds = new Set();
    for (const a of c.clusters) {
      if (!a || typeof a.id !== "string" || !a.id || a.id.length > 100 || assetIds.has(a.id)) return false;
      assetIds.add(a.id);
      for (const field of ["name", "version", "hotfix", "model", "clusterType", "status", "note"]) {
        if (a[field] != null && (typeof a[field] !== "string" || a[field].length > (field === "note" ? 5000 : 1000))) return false;
      }
      if (typeof a.name !== "string" || typeof a.version !== "string" || !a.name.trim() || !a.version.trim()) return false;
    }
  }
  return true;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Accept only one well-formed client/asset change per request; derive audit history on the server. */
export function diffOne(before: Customer[], after: Customer[]): Change | null {
  const was = new Map(before.map((c) => [c.id, c]));
  const now = new Map(after.map((c) => [c.id, c]));
  const added = after.filter((c) => !was.has(c.id));
  const removed = before.filter((c) => !now.has(c.id));
  if (added.length + removed.length === 1) {
    const existingChanged = before.some((c) => now.has(c.id) && !eq(c, now.get(c.id)));
    if (existingChanged) return null;
    if (added.length) {
      const c = added[0];
      if (c.clusters.length) return null;
      return { kind: "add_client", customerId: c.id, customerName: c.name, before: null, after: c };
    }
    const c = removed[0];
    return { kind: "delete_client", customerId: c.id, customerName: c.name, before: c, after: null };
  }
  if (added.length || removed.length) return null;
  const changed = before.filter((c) => !eq(c, now.get(c.id)));
  if (changed.length !== 1) return null;
  const oldClient = changed[0], newClient = now.get(oldClient.id)!;
  if (oldClient.name !== newClient.name) return null;
  const oldMap = new Map(oldClient.clusters.map((a) => [a.id, a]));
  const newMap = new Map(newClient.clusters.map((a) => [a.id, a]));
  const addedA = newClient.clusters.filter((a) => !oldMap.has(a.id));
  const removedA = oldClient.clusters.filter((a) => !newMap.has(a.id));
  const editedA = oldClient.clusters.filter((a) => newMap.has(a.id) && !eq(a, newMap.get(a.id)));
  if (addedA.length + removedA.length + editedA.length !== 1) return null;
  const oldA = removedA[0] || editedA[0] || null;
  const newA = addedA[0] || (oldA ? newMap.get(oldA.id) : null) || null;
  return {
    kind: addedA.length ? "add_cluster" : removedA.length ? "delete_cluster" : "edit_cluster",
    customerId: oldClient.id, customerName: oldClient.name,
    clusterId: (oldA || newA)!.id, clusterName: (newA || oldA)!.name,
    before: oldA, after: newA,
  };
}

export function undo(current: Customer[], entry: RecycleEntry): { list?: Customer[]; error?: string } {
  const list = structuredClone(current);
  const index = list.findIndex((c) => c.id === entry.customerId);
  const conflict = "This item has changed since the recorded action. Undo was blocked to protect newer edits.";
  if (entry.kind === "add_client") {
    if (index < 0 || !entry.after || !eq(list[index], entry.after)) return { error: conflict };
    return { list: list.filter((c) => c.id !== entry.customerId) };
  }
  if (entry.kind === "delete_client") {
    if (index >= 0 || !entry.before) return { error: "The client already exists or its original data is unavailable." };
    list.push(entry.before as Customer); return { list };
  }
  if (index < 0) return { error: "Restore the parent client first." };
  const clusters = list[index].clusters;
  const ai = clusters.findIndex((a) => a.id === entry.clusterId);
  if (entry.kind === "add_cluster") {
    if (ai < 0 || !entry.after || !eq(clusters[ai], entry.after)) return { error: conflict };
    clusters.splice(ai, 1); return { list };
  }
  if (entry.kind === "delete_cluster") {
    if (ai >= 0 || !entry.before) return { error: "This asset already exists or recovery data is unavailable." };
    clusters.push(entry.before as Asset); return { list };
  }
  if (entry.kind === "edit_cluster") {
    if (ai < 0 || !entry.before || !entry.after || !eq(clusters[ai], entry.after)) return { error: conflict };
    clusters[ai] = entry.before as Asset; return { list };
  }
  return { error: "Unknown change type." };
}

// Redis Lua compare-and-swap prevents two browser tabs from overwriting each other.
const COMMIT_SCRIPT = `local r=tonumber(redis.call('GET',KEYS[1]) or '0'); if r~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[2],ARGV[2]); redis.call('SET',KEYS[3],ARGV[3]); redis.call('SET',KEYS[4],ARGV[4]); redis.call('SET',KEYS[1],r+1); return 1`;
async function commit(expected: number, customers: Customer[], logs: Audit[], recycle: RecycleEntry[]) {
  return Number(await kv.eval(COMMIT_SCRIPT, [VK, CK, LK, RK], [String(expected), JSON.stringify(customers), JSON.stringify(logs), JSON.stringify(recycle)])) === 1;
}
function audit(user: { email: string; name: string }, ip: string, description: string): Audit {
  return { id: `log_${randomUUID()}`, userEmail: user.email, userName: user.name,
    ipAddress: ip, description, timestamp: Date.now() };
}
async function appendLog(user: { email: string; name: string }, ip: string, description: string) {
  for (let n = 0; n < 4; n++) {
    const s = await state();
    const logs = [audit(user, ip, description), ...s.logs].slice(0, MAX_HISTORY);
    if (await commit(s.revision, s.customers, logs, s.recycle)) return { logs, revision: s.revision + 1 };
  }
  throw new Error("Concurrent update, could not record event");
}

async function refreshTargets() {
  const result = await fetchLatestTakes();
  const existing = (await kv.hgetall("settings:targets") || {}) as Record<string, string>;
  const latest = { ...existing };
  for (const item of result.takes) latest[item.version] = item.take;
  if (result.takes.length) {
    await kv.hset("settings:targets", Object.fromEntries(result.takes.map((i) => [i.version, i.take])));
    await kv.set("settings:targets_last_updated", Date.now());
  }
  await kv.set("settings:targets_errors", JSON.stringify(result.errors));
  await kv.set("settings:targets_last_attempt", Date.now());
  return { targets: latest, errors: result.errors, succeeded: result.takes.length };
}
export async function GET() {
  try {
    if (!(await getSession())) return response({ error: "Authentication required" }, 401);
    const now = Date.now();
    const attempt = Number(await kv.get("settings:targets_last_attempt")) || 0;
    const existing = (await kv.hgetall("settings:targets") || {}) as Record<string, string>;
    const missing = VERSION_IDS.some((v) => !existing[v]);
    const cadence = missing ? 15 * 60_000 : 60 * 60_000;
    // Lock avoids a stampede from multiple users loading simultaneously.
    if (now - attempt > cadence) {
      const lock = await kv.set("settings:sync_lock", "1", { nx: true, ex: 35 });
      if (lock === "OK") {
        try { await refreshTargets(); } finally { await kv.del("settings:sync_lock"); }
      }
    }
    const [targets, targetErrors, lastUpdated, lastChecked, s] = await Promise.all([
      kv.hgetall("settings:targets"), kv.get("settings:targets_errors"),
      kv.get("settings:targets_last_updated"), kv.get("settings:targets_last_attempt"), state(),
    ]);
    return response({ targets: targets || {}, targetErrors: unpack(targetErrors, {}), lastUpdated: Number(lastUpdated) || 0,
      lastChecked: Number(lastChecked) || 0, ...s });
  } catch (error) {
    console.error("Dashboard GET failed:", error);
    return response({ error: "Dashboard database unavailable; no data has been overwritten." }, 503);
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req) || !req.headers.get("content-type")?.includes("application/json")) return response({ error: "Forbidden" }, 403);
  try {
    const user = await getSession();
    if (!user) return response({ error: "Authentication required" }, 401);
    const ip = requesterIp(req);
    const body = await req.json();
    if (body.action === "force_sync") {
      const lock = await kv.set("settings:force_sync_lock", "1", { nx: true, ex: 60 });
      if (lock !== "OK") return response({ error: "Please wait before syncing again." }, 429);
      const result = await refreshTargets();
      const summary = CP_VERSIONS.map((v) => `${v.id}: ${result.errors[v.id] ? "failed (previous value retained)" : `Take ${result.targets[v.id]}`}`).join(" | ");
      const logged = await appendLog(user, ip, `Check Point published-Take sync: ${summary}`);
      return response({ success: result.succeeded > 0, ...result, ...logged });
    }
    if (body.action === "update_customers") {
      if (!validate(body.customers) || JSON.stringify(body.customers).length > 2_000_000) return response({ error: "Invalid customer or asset data." }, 400);
      const s = await state();
      if (!Number.isInteger(body.revision) || s.revision !== body.revision) return response({ error: "Someone else changed the dashboard. Reload before saving." }, 409);
      const change = diffOne(s.customers, body.customers);
      if (!change) return response({ error: "Only one add, edit, or delete operation can be saved at a time." }, 400);
      const entry: RecycleEntry = { ...change, id: `rb_${randomUUID()}`, userEmail: user.email, userName: user.name,
        ipAddress: ip, timestamp: Date.now(), restoredAt: null, restoredBy: null };
      const name = change.clusterName || change.customerName;
      const logs = [audit(user, ip, `${describe[change.kind]}: ${name} (${change.customerName})`), ...s.logs].slice(0, MAX_HISTORY);
      const recycle = [entry, ...s.recycle].slice(0, MAX_HISTORY);
      if (!await commit(s.revision, body.customers, logs, recycle)) return response({ error: "Concurrent edit detected. Reload before saving." }, 409);
      return response({ success: true, customers: body.customers, revision: s.revision + 1, logs, recycle });
    }
    if (body.action === "restore_item") {
      if (typeof body.entryId !== "string") return response({ error: "Invalid entry." }, 400);
      for (let tryNo = 0; tryNo < 3; tryNo++) {
        const s = await state();
        const entry = s.recycle.find((e) => e.id === body.entryId);
        if (!entry) return response({ error: "Recycle bin entry not found." }, 404);
        if (entry.restoredAt) return response({ error: "This action was already undone." }, 409);
        const result = undo(s.customers, entry);
        if (result.error || !result.list) return response({ error: result.error || "Cannot restore." }, 409);
        const recycle = s.recycle.map((e) => e.id === entry.id ? { ...e, restoredAt: Date.now(), restoredBy: user.email } : e);
        const logs = [audit(user, ip, `UNDO: ${describe[entry.kind]} ${entry.clusterName || entry.customerName} (${entry.customerName})`), ...s.logs].slice(0, MAX_HISTORY);
        if (await commit(s.revision, result.list, logs, recycle)) return response({ success: true, customers: result.list, revision: s.revision + 1, recycle, logs });
      }
      return response({ error: "Another edit occurred. Reload and retry." }, 409);
    }
    if (body.action === "log_event") {
      if (typeof body.description !== "string" || !/^Generated report |^Downloaded CSV report |^Downloaded JSON backup/.test(body.description)) return response({ error: "Invalid event" }, 400);
      const logged = await appendLog(user, ip, body.description.slice(0, 220));
      return response({ success: true, ...logged });
    }
    return response({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("Dashboard POST failed:", error);
    return response({ error: "Operation failed. Existing database records were not intentionally reset." }, 503);
  }
}
