"use client";
import { useEffect, useState } from "react";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { ShieldAlert, ShieldCheck, Server, LogOut, ChevronDown, RefreshCw } from "lucide-react";

export default function SOCDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ targets: {}, customers: [], lastUpdated: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Function to fetch latest data from KV database
  const loadData = async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error("Failed to fetch data", e);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        loadData();
        // AUTO-REFRESH: Poll the database every 5 minutes (300000ms)
        const interval = setInterval(loadData, 300000);
        return () => clearInterval(interval);
      }
    });
    return () => unsub();
  }, []);

  const login = async () => {
    try { 
      await signInWithPopup(auth, googleProvider); 
    } catch (e: any) { 
      console.error("Firebase Auth Error:", e);
      alert(`Firebase Error: ${e.message}`); 
    }
  };

  // Function to force an immediate scrape from Check Point servers
  const handleForceSync = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force_sync" })
      });
      if (res.ok) {
        await loadData();
      } else {
        alert("Scraping failed. Check server logs.");
      }
    } catch (e) {
      console.error(e);
    }
    setIsUpdating(false);
  };

  const getStatusColor = (version: string, currentTake: string) => {
    const targetTakeStr = data.targets[version];
    if (!targetTakeStr || !currentTake) return "border-gray-600 text-gray-400";
    
    const current = parseInt(currentTake.replace(/\D/g, '')) || 0;
    const target = parseInt(targetTakeStr.replace(/\D/g, '')) || 0;

    if (current >= target) return "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-emerald-400";
    if (current >= target - 20) return "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-amber-400";
    return "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] text-red-500";
  };

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-500 font-mono tracking-widest">INITIALIZING SECURE CONNECTION...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-mono relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        <div className="z-10 bg-slate-900 border border-cyan-500/30 p-12 shadow-[0_0_50px_rgba(6,182,212,0.15)] text-center max-w-md w-full">
          <ShieldAlert className="w-20 h-20 mx-auto text-red-500 mb-6 animate-pulse" />
          <h1 className="text-3xl font-black tracking-widest text-white mb-2 uppercase">NOC Command</h1>
          <p className="text-cyan-400 text-sm mb-8 tracking-widest">RESTRICTED ACCESS AREA</p>
          <button onClick={login} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 transition-all uppercase tracking-widest border-2 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            Authenticate via Identity Provider
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-mono flex flex-col selection:bg-cyan-900">
      
      {/* LIVE INTELLIGENCE TICKER */}
      <div className="bg-red-950/80 border-b border-red-500/50 text-red-400 py-1.5 overflow-hidden whitespace-nowrap relative flex items-center">
        <div className="animate-[marquee_20s_linear_infinite] inline-block font-bold tracking-widest text-sm w-full">
          🚨 LIVE THREAT INTELLIGENCE: TARGET JUMBO HOTFIX DEPLOYMENT REQUIRED 
          <span className="text-white mx-4">|</span> R81.20: TARGET TAKE {data.targets["R81.20"] || '170'} 
          <span className="text-white mx-4">|</span> R82: TARGET TAKE {data.targets["R82"] || '127'} 
          <span className="text-white mx-4">|</span> SECURE ALL PERIMETERS 🚨
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="border-b border-slate-800 bg-slate-900/50 px-6 py-4 flex justify-between items-center backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-cyan-500 w-8 h-8" />
          <div>
            <h1 className="text-xl font-black text-white tracking-widest leading-none">SECURITY MATRIX</h1>
            <span className="text-xs text-cyan-500 tracking-[0.2em]">CHECK POINT FLEET COMMAND</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <button 
              onClick={handleForceSync}
              disabled={isUpdating}
              className="flex items-center gap-2 text-xs bg-cyan-900/40 hover:bg-cyan-900 text-cyan-400 px-4 py-1.5 border border-cyan-500/30 uppercase tracking-widest transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Pinging CP Servers...' : 'Force CP Sync'}
            </button>
            <span className="text-[10px] text-slate-500 mt-1 mr-1">
              Last Scrape: {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : 'Unknown'}
            </span>
          </div>

          <div className="text-right hidden md:block pl-6 border-l border-slate-800">
            <div className="text-sm font-bold text-white uppercase">{user?.displayName || 'Engineer'}</div>
            <div className="text-xs text-slate-500">Security Operations</div>
          </div>
          <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-400 transition-colors" title="Log Out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* DASHBOARD CONTENT */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        
        <div className="flex justify-between items-end mb-8 border-b border-slate-800 pb-4 mt-4">
          <h2 className="text-2xl text-white font-bold uppercase tracking-wider">Client Perimeters</h2>
          <button className="bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            + Add Client Perimeter
          </button>
        </div>

        <div className="space-y-4">
          {data.customers?.map((customer: any) => (
            <div key={customer.id} className="bg-slate-900 border border-slate-800 rounded-sm overflow-hidden transition-all duration-300 shadow-md">
              
              <button 
                onClick={() => setExpanded(expanded === customer.id ? null : customer.id)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-800/80 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <Server className="text-cyan-600 w-6 h-6" />
                  <span className="text-xl font-bold text-white uppercase tracking-wider">{customer.name}</span>
                  <span className="bg-slate-800 text-slate-400 text-xs px-2 py-1 rounded-sm border border-slate-700">
                    {customer.clusters?.length || 0} Clusters
                  </span>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${expanded === customer.id ? 'rotate-180' : ''}`} />
              </button>

              <div className={`grid transition-all duration-300 ease-in-out ${expanded === customer.id ? 'grid-rows-[1fr] opacity-100 border-t border-slate-800' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-900/40 shadow-inner">
                    {customer.clusters?.map((cluster: any) => {
                      const statusStyles = getStatusColor(cluster.version, cluster.hotfix);
                      
                      return (
                        <div key={cluster.id} className={`p-4 bg-slate-950 border-l-4 ${statusStyles} flex flex-col gap-3 relative group transition-all duration-300 hover:bg-slate-900`}>
                          
                          <div className="flex justify-between items-start">
                            <h3 className="font-bold text-white tracking-widest uppercase">{cluster.name}</h3>
                            <button className="text-xs bg-slate-800 hover:bg-cyan-900 text-slate-400 hover:text-cyan-300 px-3 py-1 transition-colors opacity-0 group-hover:opacity-100 border border-slate-700 rounded-sm">
                              EDIT
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm mt-1">
                            <div>
                              <div className="text-slate-500 text-xs uppercase mb-1 tracking-wider">Version</div>
                              <div className="font-bold text-slate-300">{cluster.version}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-xs uppercase mb-1 tracking-wider">JHF Level</div>
                              <div className={`font-black ${statusStyles.split(' ')[2]}`}>
                                {cluster.hotfix || 'Unknown'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 bg-slate-900/80 p-2.5 text-xs text-slate-400 border border-slate-800 font-sans italic rounded-sm leading-relaxed">
                            <span className="text-slate-500 font-bold uppercase not-italic mr-1 text-[10px]">Status:</span> 
                            {cluster.status}
                          </div>
                        </div>
                      )
                    })}
                    {(!customer.clusters || customer.clusters.length === 0) && (
                      <div className="text-slate-500 italic text-sm py-4 w-full col-span-full text-center">
                        No security clusters deployed or mapped to this perimeter.
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>
          ))}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
      `}} />
    </div>
  );
}