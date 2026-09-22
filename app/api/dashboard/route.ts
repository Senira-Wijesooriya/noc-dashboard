import { NextResponse } from 'next/server';
import kv from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Seed data based on your uploaded CSV
const INITIAL_CUSTOMERS = [
  { id: "c1", name: "Sampath Bank", clusters: [{ id: "cl1", name: "Production", version: "R81.20", hotfix: "Take 100", status: "Pending Analysis" }] },
  { id: "c2", name: "HNB", clusters: [{ id: "cl2", name: "Production Gateway", version: "R81.20", hotfix: "Take 141", status: "IKE Portfix Installed" }] },
  { id: "c3", name: "BOC", clusters: [
    { id: "cl3", name: "Primary DC", version: "R81.20", hotfix: "Take 105", status: "Pending Upgrade" },
    { id: "cl4", name: "DR Gateway", version: "R81.20", hotfix: "Take 141", status: "Upgraded" }
  ]},
  { id: "c4", name: "Peoples Bank", clusters: [{ id: "cl5", name: "Prod Primary", version: "R81.20", hotfix: "Take 141", status: "Only Primary IKE Installed" }] },
  { id: "c5", name: "CDB", clusters: [
    { id: "cl6", name: "DR Cluster", version: "R81.20", hotfix: "Take 141", status: "Upgraded" },
    { id: "cl7", name: "Prod Primary", version: "R81.20", hotfix: "Take 105", status: "Pending" }
  ]},
  { id: "c6", name: "SAGT", clusters: [{ id: "cl8", name: "Core Firewall", version: "R82", hotfix: "Take 103", status: "R82 Gateway Up to date" }] }
];

const DEFAULT_TARGETS = {
  "R81.20": "156",
  "R82": "53"
};

export async function GET() {
  try {
    let targets = await kv.hgetall("settings:targets");
    if (!targets || Object.keys(targets).length === 0) {
      await kv.hset("settings:targets", DEFAULT_TARGETS);
      targets = DEFAULT_TARGETS;
    }

    let customers = await kv.get("data:customers");
    if (!customers) {
      await kv.set("data:customers", JSON.stringify(INITIAL_CUSTOMERS));
      customers = INITIAL_CUSTOMERS;
    }

    return NextResponse.json({ targets, customers: typeof customers === 'string' ? JSON.parse(customers) : customers });
  } catch (error) {
    // Memory fallback if KV is not yet linked in Vercel
    return NextResponse.json({ targets: DEFAULT_TARGETS, customers: INITIAL_CUSTOMERS });
  }
}