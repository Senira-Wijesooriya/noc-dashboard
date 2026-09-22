import { NextResponse } from 'next/server';
import kv from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Initial Seed Data
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

// The Web Scraper Engine
async function scrapeCheckPoint() {
  try {
    const fetchTake = async (url: string) => {
      // Fetch the public HTML directly from Check Point
      const res = await fetch(url, { 
        next: { revalidate: 0 }, 
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } 
      });
      const html = await res.text();
      
      // Find every instance of "Take [number]" in the HTML using Regex
      const matches = [...html.matchAll(/Take\s+(\d+)/gi)];
      const takes = matches.map(m => parseInt(m[1])).filter(n => !isNaN(n));
      
      // Return the absolute highest take number found on the page
      return takes.length > 0 ? Math.max(...takes).toString() : null;
    };

    const r81 = await fetchTake("https://sc1.checkpoint.com/documents/Jumbo_HFA/R81.20/R81.20/R81.20_Downloads.htm");
    const r82 = await fetchTake("https://sc1.checkpoint.com/documents/Jumbo_HFA/R82/R82.00/R82_Downloads.htm");

    return { 
      "R81.20": r81 || "170", // Fallback to 170 if scrape fails
      "R82": r82 || "127"     // Fallback to 127 if scrape fails
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

    // AUTO-UPDATE TRIGGER: If older than 1 hour (3600000ms), scrape Check Point!
    if (!targets || !lastUpdated || (now - lastUpdated) > 3600000) {
      console.log("Data is older than 1 hour. Scraping Check Point servers...");
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

    return NextResponse.json({ 
      targets, 
      lastUpdated,
      customers: typeof customers === 'string' ? JSON.parse(customers) : customers 
    });
  } catch (error) {
    return NextResponse.json({ targets: { "R81.20": "170", "R82": "127" }, customers: INITIAL_CUSTOMERS });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 1. Force manual scrape sync
    if (body.action === 'force_sync') {
      const scrapedTargets = await scrapeCheckPoint();
      if (scrapedTargets) {
        await kv.hset("settings:targets", scrapedTargets);
        await kv.set("settings:targets_last_updated", Date.now());
        return NextResponse.json({ success: true, targets: scrapedTargets });
      }
      return NextResponse.json({ success: false, error: "Scrape failed" }, { status: 500 });
    }
    
    // 2. Save new or edited customer/cluster data
    if (body.action === 'update_customers') {
      if (body.customers) {
        await kv.set("data:customers", JSON.stringify(body.customers));
        return NextResponse.json({ success: true });
      }
    }
    
    return NextResponse.json({ success: false });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}