import { NextResponse } from "next/server";
import kv from "@/lib/redis";
import { getSession } from "@/lib/security";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (!(await getSession())) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const keys = ["data:customers", "data:logs", "data:recycle", "data:revision", "settings:targets", "settings:targets_last_updated"];
    const data: Record<string, unknown> = {};
    for (const key of keys) data[key] = key === "settings:targets" ? await kv.hgetall(key) : await kv.get(key);
    return new NextResponse(JSON.stringify({ createdAt: new Date().toISOString(), data }, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="shipyard-backup.json"', "Cache-Control": "no-store" },
    });
  } catch { return NextResponse.json({ error: "Backup failed." }, { status: 503 }); }
}
