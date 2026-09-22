import { NextResponse } from 'next/server';
import kv from '@/lib/redis';

export const dynamic = 'force-dynamic';

const INITIAL_CUSTOMERS = [
  { id: "c1", name: "Sampath Bank", clusters: [{ id: "cl1", name: "Production", version: "R81.20", hotfix: "Take 100", model: "Quantum 9200", clusterType: "Cluster", status: "Pending Analysis", note: "Scheduled for weekend maintenance window." }] },
  { id: "c2", name: "HNB", clusters: [{ id: "cl2", name: "Production Gateway", version: "R81.20", hotfix: "Take 141", model: "Quantum 6200", clusterType: "Single GW", status: "IKE Portfix Installed", note: "Critical banking perimeter node." }] },
  { id: "c3", name: "BOC", clusters: [
    { id: "cl3", name: "Primary DC", version: "R81.20", hotfix: "Take 105", model: "Quantum 9200", clusterType: "Cluster", status: "Pending Upgrade", note: "Primary DC gateway awaiting scheduling." },
    { id: "cl4", name: "DR Gateway", version: "R81.20", hotfix: "Take 141", model: "Quantum 5600", clusterType: "Cluster", status: "Upgraded", note: "DR site fully operational on Take 141." }
  ]},
  { id: "c4", name: "Peoples Bank", clusters: [{ id: "cl5", name: "Prod Primary", version: "R81.20", hotfix: "Take 141", model: "Quantum 6200", clusterType: "Single GW", status: "Only Primary IKE Installed", note: "Secondary standby node pending sync." }] },
  { id: "c5", name: "CDB", clusters: [
    { id: "cl6", name: "DR Cluster", version: "R81.20", hotfix: "Take 141", model: "Quantum 5600", clusterType: "Cluster", status: "Upgraded", note: "DR nodes verified." },
    { id: "cl7", name: "Prod Primary", version: "R81.20", hotfix: "Take 105", model: "Quantum 9200", clusterType: "Single GW", status: "Pending", note: "Pending change request approval." }
  ]},
  { id: "c6", name: "SAGT", clusters: [{ id: "cl8", name: "Core Firewall", version: "R82", hotfix: "Take 103", model: "Quantum Force 19000", clusterType: "Cluster", status: "R82 Gateway Up to date", note: "Running latest R82 build." }] }
];

async function scrapeCheckPoint() {
  try {
    const fetchTake = async (url: string) => {
      const res = await fetch(url, { 
        next: { revalidate: 0 }, 
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } 
      });
      const html = await res.text();
      const matches = [...html.matchAll(/Take\s+(\d+)/gi)];
      const takes = matches.map(m => parseInt(m[1])).filter(n => !isNaN(n));
      return takes.length > 0 ? Math.max(...takes).toString() : null;
    };

    const r81 = await fetchTake("https://sc1.checkpoint.com/documents/Jumbo_HFA/R81.20/R81.20/R81.20_Downloads.htm");
    const r82 = await fetchTake("https://sc1.checkpoint.com/documents/Jumbo_HFA/R82/R82.00/R82_Downloads.htm");

    return { 
      "R81.20": r81 || "170",
      "R82": r82 || "127"
    };
  } catch (error) {
    console.error("Scraping failed:", error);
    return null;
  }
}

export async function GET() {
  try {
    let targets = await kv.hgetall("settings:targets") as Record<string, string>;
    let lastUpdated = Number(await kv.get("settings:targets_last_updated")) || 0;
    const now = Date.now();

    if (!targets || !lastUpdated || (now - lastUpdated) > 3600000) {
      const scrapedTargets = await scrapeCheckPoint();
      if (scrapedTargets) {
        targets = scrapedTargets;
        await kv.hset("settings:targets", targets);
        await kv.set("settings:targets_last_updated", now);
        lastUpdated = now;
      }
    }

    let customers = await kv.get("data:customers");
    if (!customers) {
      await kv.set("data:customers", JSON.stringify(INITIAL_CUSTOMERS));
      customers = INITIAL_CUSTOMERS;
    }

    let logs = await kv.get("data:logs");
    if (!logs) {
      logs = [];
    }

    return NextResponse.json({ 
      targets, 
      lastUpdated,
      customers: typeof customers === 'string' ? JSON.parse(customers) : customers,
      logs: typeof logs === 'string' ? JSON.parse(logs) : logs
    });
  } catch (error) {
    return NextResponse.json({ targets: { "R81.20": "170", "R82": "127" }, customers: INITIAL_CUSTOMERS, logs: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userEmail = body.userEmail || 'Unknown User';
    const userName = body.userName || 'Engineer';
    
    let logs: any = (await kv.get("data:logs")) || [];
    if (typeof logs === 'string') logs = JSON.parse(logs);

    const recordLog = (desc: string) => {
      const newLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        userEmail,
        userName,
        description: desc,
        timestamp: Date.now()
      };
      logs = [newLog, ...logs].slice(0, 100); // Keep last 100 actions
    };

    if (body.action === 'force_sync') {
      const scrapedTargets = await scrapeCheckPoint();
      if (scrapedTargets) {
        await kv.hset("settings:targets", scrapedTargets);
        await kv.set("settings:targets_last_updated", Date.now());
        recordLog(`Forced Check Point Sync (R81.20: Take ${scrapedTargets["R81.20"]}, R82: Take ${scrapedTargets["R82"]})`);
        await kv.set("data:logs", JSON.stringify(logs));
        return NextResponse.json({ success: true, targets: scrapedTargets, logs });
      }
      return NextResponse.json({ success: false, error: "Scrape failed" }, { status: 500 });
    }
    
    if (body.action === 'update_customers') {
      if (body.customers) {
        await kv.set("data:customers", JSON.stringify(body.customers));
        recordLog(body.logDescription || `Modified client perimeters or cluster configurations`);
        await kv.set("data:logs", JSON.stringify(logs));
        return NextResponse.json({ success: true, logs });
      }
    }
    
    return NextResponse.json({ success: false });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}