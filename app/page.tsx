"use client";
import { useEffect, useState } from "react";
import { CP_VERSIONS, DEFAULT_VERSION } from "@/lib/versions";
import { installedTake } from "@/lib/takes";
import { ShieldAlert, Server, LogOut, ChevronDown, RefreshCw, Plus, X, FileText, Cpu, Trash2, History, Mail, Undo2, ArchiveRestore, FileBarChart, Download, Printer } from "lucide-react";
import { buildRows, buildCsv, buildReportHtml } from "@/lib/report";

export default function SOCDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ targets: {}, targetErrors: {}, customers: [], logs: [], recycle: [], lastUpdated: 0, revision: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // Only a verified company mailbox receives a server-managed login session.
  const [loginEmail, setLoginEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const verifiedOfficeMail = user?.email || "";

  // Modals
  const [editModal, setEditModal] = useState<{customerId: string, cluster: any} | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showRecycleModal, setShowRecycleModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportScope, setReportScope] = useState<string>("all");
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.status === 401) { setUser(null); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load dashboard");
      setData({
        targets: json.targets || {}, targetErrors: json.targetErrors || {},
        lastUpdated: json.lastUpdated || 0, lastChecked: json.lastChecked || 0,
        customers: Array.isArray(json.customers) ? json.customers : [],
        logs: Array.isArray(json.logs) ? json.logs : [],
        recycle: Array.isArray(json.recycle) ? json.recycle : [],
        revision: Number(json.revision) || 0,
      });
    } catch (error) {
      console.error(error);
      alert("Dashboard could not load. Your existing data has not been reset. Please try refreshing.");
    }
  };

  useEffect(() => {
    let active = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (active) setUser(j.authenticated ? j.user : null); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    loadData();
    const id = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user?.email]);

  const authRequest = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: codeRequested ? "verify_code" : "request_code", email: loginEmail, code: verificationCode }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Verification failed");
      if (codeRequested) { setUser(j.user); setVerificationCode(""); }
      else { setCodeRequested(true); }
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Verification failed"); }
    finally { setAuthBusy(false); }
  };

  const resendCode = async () => {
    setAuthBusy(true); setAuthError("");
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_code", email: loginEmail }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unable to send code");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Unable to resend code"); }
    finally { setAuthBusy(false); }
  };
  const logout = async () => {
    try { await fetch("/api/auth", { method: "DELETE" }); }
    finally { setUser(null); setData({ targets: {}, targetErrors: {}, customers: [], logs: [], recycle: [], lastUpdated: 0, revision: 0 }); }
  };

  const handleForceSync = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force_sync" }) });
      const result = await res.json();
      await loadData();
      if (!res.ok || !result.success) alert(result.error || "No versions could be refreshed. Previous values have been retained.");
      else if (Object.keys(result.errors || {}).length) alert("Some Check Point sources could not be refreshed. Previous values were retained for those versions.");
    } catch { alert("Sync failed. Check the connection and try again."); }
    finally { setIsUpdating(false); }
  };

  const saveCustomersToDB = async (updatedCustomers: any, _logDesc: string, _recycleEntry?: any) => {
    try {
      const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_customers", customers: updatedCustomers, revision: data.revision }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setData((prev: any) => ({ ...prev, customers: json.customers, revision: json.revision, logs: json.logs, recycle: json.recycle }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Save failed");
      await loadData();
    }
  };

  const handleUndo = async (entryId: string) => {
    setUndoingId(entryId);
    try {
      const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore_item", entryId }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not undo");
      setData((prev: any) => ({ ...prev, customers: json.customers, revision: json.revision, recycle: json.recycle, logs: json.logs }));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Network error while undoing");
      await loadData();
    } finally { setUndoingId(null); }
  };

  const logEvent = (description: string) => {
    fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log_event", description }) })
      .then((r) => r.json()).then((j) => { if (j.logs) setData((prev: any) => ({ ...prev, logs: j.logs, revision: Math.max(prev.revision, j.revision ?? 0) })); })
      .catch(console.error);
  };

  const reportContext = () => {
    const customers = reportScope === "all" ? data.customers : data.customers.filter((c: any) => c.id === reportScope);
    const scopeLabel = reportScope === "all" ? "All Clients" : (customers[0]?.name || "Client");
    return { rows: buildRows(customers, data.targets, data.targetErrors), scopeLabel };
  };

  const handleOpenReport = () => {
    const { rows, scopeLabel } = reportContext();
    const html = buildReportHtml({ rows, targets: data.targets, targetErrors: data.targetErrors, scopeLabel, generatedBy: verifiedOfficeMail, logoUrl: `${window.location.origin}/MillenniumIT_ESP.png` });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) alert("Your browser blocked the report window. Please allow pop-ups for this site and try again.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    logEvent(`Generated report (${scopeLabel}, ${rows.length} assets)`);
  };

  const handleDownloadCsv = () => {
    const { rows, scopeLabel } = reportContext();
    const url = URL.createObjectURL(new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `CheckPoint_Report_${scopeLabel.replace(/[^a-z0-9]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logEvent(`Downloaded CSV report (${scopeLabel}, ${rows.length} assets)`);
  };

  const describeEntry = (e: any) => {
    const labels: any = { add_client: "Added client", delete_client: "Deleted client", add_cluster: "Added asset", edit_cluster: "Edited asset", delete_cluster: "Deleted asset" };
    return `${labels[e.kind] || e.kind}: ${e.clusterName || e.customerName}${e.clusterName ? ` (${e.customerName})` : ""}`;
  };

  const handleAddClient = () => {
    const name = prompt("Enter new Client Perimeter Name (e.g. Seylan, Commercial Bank):");
    if (!name) return;
    
    const newCustomer = {
      id: `c_${Date.now()}`,
      name: name.toUpperCase(),
      clusters: []
    };
    saveCustomersToDB([...data.customers, newCustomer], `Added client perimeter: ${name.toUpperCase()}`,
      { kind: "add_client", customerId: newCustomer.id, customerName: newCustomer.name, before: null });
  };

  const handleDeleteClient = (customerId: string, customerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete client perimeter "${customerName}" and all its clusters?`)) return;

    const updatedCustomers = data.customers.filter((c: any) => c.id !== customerId);
    const removed = data.customers.find((c: any) => c.id === customerId);
    saveCustomersToDB(updatedCustomers, `Deleted client perimeter: ${customerName}`,
      { kind: "delete_client", customerId, customerName, before: removed });
  };

  const handleSaveCluster = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const clusterName = formData.get("name");
    const isNew = !editModal.cluster.id;

    const updatedCluster = {
      id: editModal.cluster.id || `cl_${Date.now()}`,
      name: clusterName,
      version: formData.get("version"),
      hotfix: formData.get("hotfix"),
      model: formData.get("model"),
      clusterType: formData.get("clusterType"),
      status: formData.get("status"),
      note: formData.get("note"),
    };

    const updatedCustomers = data.customers.map((c: any) => {
      if (c.id === editModal.customerId) {
        const exists = c.clusters?.find((cl: any) => cl.id === updatedCluster.id);
        const newClusters = exists 
          ? c.clusters.map((cl: any) => cl.id === updatedCluster.id ? updatedCluster : cl)
          : [...(c.clusters || []), updatedCluster];
        return { ...c, clusters: newClusters };
      }
      return c;
    });

    const owner = data.customers.find((c: any) => c.id === editModal.customerId);
    const previous = owner?.clusters?.find((cl: any) => cl.id === updatedCluster.id) || null;
    const recycleEntry = {
      kind: isNew ? "add_cluster" : "edit_cluster", customerId: editModal.customerId, customerName: owner?.name || "",
      clusterId: updatedCluster.id, clusterName: String(clusterName || ""), before: previous,
    };
    const actionText = isNew ? `Deployed cluster/asset "${clusterName}"` : `Updated cluster/asset "${clusterName}"`;
    saveCustomersToDB(updatedCustomers, actionText, recycleEntry);
    setEditModal(null);
  };

  const handleDeleteCluster = () => {
    if (!editModal || !editModal.cluster.id) return;
    if (!confirm(`Are you sure you want to delete cluster ${editModal.cluster.name}?`)) return;

    const clusterName = editModal.cluster.name;
    const updatedCustomers = data.customers.map((c: any) => {
      if (c.id === editModal.customerId) {
        return { ...c, clusters: c.clusters.filter((cl: any) => cl.id !== editModal.cluster.id) };
      }
      return c;
    });

    const owner = data.customers.find((c: any) => c.id === editModal.customerId);
    saveCustomersToDB(updatedCustomers, `Deleted cluster/asset "${clusterName}"`,
      { kind: "delete_cluster", customerId: editModal.customerId, customerName: owner?.name || "",
        clusterId: editModal.cluster.id, clusterName, before: editModal.cluster });
    setEditModal(null);
  };

  const getStatusColor = (version: string, currentTake: any) => {
    const targetTakeStr = String(data?.targets?.[version] || '');
    if (data.targetErrors?.[version]) return "border-zinc-700 text-zinc-400";
    const currentTakeStr = String(currentTake || '');
    if (!targetTakeStr || !currentTakeStr || currentTakeStr === 'undefined') return "border-zinc-700 text-zinc-400"; 
    
    const current = installedTake(currentTakeStr) || 0;
    const target = Number(targetTakeStr) || 0;

    if (current >= target) return "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-emerald-400";
    const warnGap = CP_VERSIONS.find((v) => v.id === version)?.warnGap ?? 20;
    if (current >= target - warnGap) return "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-amber-400";
    return "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)] text-orange-400";
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-orange-500 font-mono tracking-widest font-bold">INITIALIZING MITESP SECURE SHIPYARD...</div>;

  if (!user) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white font-mono relative p-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a2e_1px,transparent_1px),linear-gradient(to_bottom,#27272a2e_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"></div>
      <div className="relative z-10 bg-zinc-900 border border-orange-500/50 p-9 shadow-[0_0_50px_rgba(249,115,22,0.2)] max-w-md w-full rounded-sm">
        <img src="/MillenniumIT_ESP.png" alt="MillenniumIT ESP" className="h-16 w-auto mx-auto mb-6 bg-white/5 p-2 rounded border border-zinc-700" />
        <h1 className="text-2xl font-black tracking-widest text-white text-center uppercase">Check Point Shipyard</h1>
        <p className="text-orange-400 text-xs mb-7 tracking-widest uppercase font-bold text-center">Secure Fleet Command Center</p>
        <div className="flex items-center gap-2 text-xs text-zinc-300 mb-5 bg-zinc-950 border border-zinc-800 p-3">
          <Mail className="text-orange-400 w-5 h-5 shrink-0" /> {codeRequested ? "Enter the 6-digit code sent to your corporate inbox (expires after 10 minutes)." : "Sign in using your verified @mitesp.com work email. No Google login or password required."}
        </div>
        <form className="space-y-4" onSubmit={authRequest}>
          <div><label className="block text-orange-400 text-xs font-bold uppercase mb-2">Corporate email address</label>
            <input type="email" autoComplete="email" required value={loginEmail} disabled={codeRequested || authBusy}
              onChange={(e) => setLoginEmail(e.target.value)} placeholder="name@mitesp.com"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-sm text-white px-4 py-3 text-sm focus:border-orange-500 outline-none disabled:opacity-60" />
          </div>
          {codeRequested && <div><label className="block text-orange-400 text-xs font-bold uppercase mb-2">Verification code</label>
            <input type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
              value={verificationCode} onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000" className="w-full tracking-[0.5em] text-center bg-zinc-950 border border-zinc-700 rounded-sm text-white px-4 py-3 text-lg focus:border-orange-500 outline-none" />
          </div>}
          {authError && <p role="alert" className="text-red-300 bg-red-950/50 p-2 border border-red-700 text-xs">{authError}</p>}
          <button type="submit" disabled={authBusy} className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 uppercase tracking-widest border border-orange-400 rounded-sm">
            {authBusy ? "Processing..." : codeRequested ? "Verify & sign in" : "Send sign-in code"}
          </button>
        </form>
        {codeRequested && <div className="flex justify-between gap-4 mt-4 text-xs text-orange-300">
          <button onClick={resendCode} disabled={authBusy} className="hover:underline disabled:opacity-50">Resend code</button>
          <button onClick={() => { setCodeRequested(false); setVerificationCode(""); setAuthError(""); }} className="hover:underline">Change email</button>
        </div>}
        <p className="mt-6 border-t border-zinc-800 pt-4 text-[11px] leading-relaxed text-zinc-500">Only people who can receive email at an approved company address can sign in. The application must be configured with an authorized email sender.</p>
      </div>
    </div>
  );

  const behindCount = (Array.isArray(data.customers) ? data.customers : []).reduce((n: number, c: any) => {
    return n + (Array.isArray(c?.clusters) ? c.clusters.filter((cl: any) => {
      const target = Number(data?.targets?.[cl.version]) || 0;
      const current = installedTake(cl.hotfix) || 0;
      return target > 0 && current > 0 && !data.targetErrors?.[cl.version] && current < target;
    }).length : 0);
  }, 0);

  const officeNameOnly = verifiedOfficeMail ? verifiedOfficeMail.split('@')[0].toUpperCase() : 'ENGINEER';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col selection:bg-orange-950">
      
      {/* LIVE INTELLIGENCE TICKER (Slower 40s Speed) */}
      <div className="bg-orange-950/90 border-b border-orange-500/60 text-orange-300 py-2 overflow-hidden whitespace-nowrap relative flex items-center shadow-sm">
        <div className="animate-[marquee_40s_linear_infinite] inline-block font-bold tracking-widest text-sm w-full">
          🔥 MITESP SHIPYARD INTEL: LATEST JUMBO HOTFIX TAKES
          {CP_VERSIONS.map((v) => (
            <span key={v.id}>
              <span className="text-white mx-4">|</span> <a href={v.url} target="_blank" rel="noopener noreferrer" className="hover:text-white underline decoration-dotted underline-offset-4" title={`Open Check Point's official ${v.id} Jumbo Hotfix download page`}>{v.id}: {data?.targets?.[v.id] ? `TAKE ${data.targets[v.id]}${data?.targetErrors?.[v.id] ? ' (STALE - SYNC FAILED)' : ''}` : 'UNAVAILABLE'}</a>
            </span>
          ))}
          <span className="text-white mx-4">|</span> {data.customers.length === 0 ? 'NO CLIENT ASSETS RECORDED' : `${behindCount} KNOWN ASSET${behindCount === 1 ? '' : 'S'} BEHIND LATEST PUBLISHED TAKE`} 🔥
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="border-b border-zinc-800 bg-zinc-900/90 px-6 py-3 flex flex-wrap gap-3 justify-between items-center backdrop-blur-md sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white px-3 py-1.5 rounded flex items-center shadow-sm">
            <img src="/MillenniumIT_ESP.png" alt="MillenniumIT ESP" className="h-8 w-auto object-contain" />
          </div>
          <div className="border-l border-zinc-700 pl-4">
            <h1 className="text-base font-black text-white tracking-widest leading-none">CHECK POINT SHIPYARD</h1>
            <span className="text-[11px] text-orange-400 tracking-[0.2em] font-bold">ENTERPRISE SECURITY MATRIX</span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <a href="/api/backup" download="shipyard-backup.json" onClick={() => logEvent("Downloaded JSON backup")}
            className="flex items-center gap-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-2 border border-zinc-700 uppercase tracking-widest font-bold rounded-sm"
            title="Save a backup of clients, assets, audit history and recycle bin"><Download className="w-4 h-4 text-orange-400" /> Backup</a>
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3.5 py-2 border border-zinc-700 uppercase tracking-widest transition-colors font-bold rounded-sm shadow-sm"
          >
            <FileBarChart className="w-4 h-4 text-orange-400" />
            Report
          </button>

          <button
            onClick={() => setShowRecycleModal(true)}
            className="flex items-center gap-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3.5 py-2 border border-zinc-700 uppercase tracking-widest transition-colors font-bold rounded-sm shadow-sm"
          >
            <ArchiveRestore className="w-4 h-4 text-orange-400" />
            Recycle Bin ({(data?.recycle || []).filter((e: any) => !e.restoredAt).length})
          </button>

          <button 
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3.5 py-2 border border-zinc-700 uppercase tracking-widest transition-colors font-bold rounded-sm shadow-sm"
          >
            <History className="w-4 h-4 text-orange-400" />
            Audit Logs ({data?.logs?.length || 0})
          </button>

          <div className="flex flex-col items-end">
            <button onClick={handleForceSync} disabled={isUpdating} className="flex items-center gap-2 text-xs bg-orange-950 hover:bg-orange-900 text-orange-400 px-4 py-1.5 border border-orange-500/40 uppercase tracking-widest transition-colors disabled:opacity-50 font-bold rounded-sm">
              <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Syncing...' : 'Force CP Sync'}
            </button>
            <span className="text-[10px] text-zinc-400 mt-1 mr-1">
              Last check: {data?.lastChecked ? new Date(data.lastChecked).toLocaleString() : 'Never'}
            </span>
          </div>

          <div className="text-right hidden md:block pl-6 border-l border-zinc-800">
            <div className="text-sm font-black text-orange-400 uppercase tracking-wider">{officeNameOnly}</div>
            <div className="text-xs text-zinc-400 font-bold tracking-wider">Cyber Security Engineer</div>
          </div>
          <button onClick={logout} className="text-zinc-400 hover:text-orange-400 transition-colors" title="Log Out"><LogOut className="w-5 h-5" /></button>
        </div>
      </nav>

      {/* DASHBOARD CONTENT */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        
        <div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-4 mt-4">
          <h2 className="text-2xl text-white font-black uppercase tracking-wider">Client Perimeters</h2>
          <button onClick={handleAddClient} className="bg-zinc-900 hover:bg-zinc-800 text-orange-400 border border-orange-500/40 px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors shadow-sm rounded-sm">
            + Add Client Perimeter
          </button>
        </div>

        <div className="space-y-4">
          {Array.isArray(data?.customers) && data.customers.length > 0 ? (
            data.customers.map((customer: any) => (
              <div key={customer.id || Math.random()} className="bg-zinc-900 border border-zinc-800 rounded-sm overflow-hidden transition-all duration-300 shadow-md">
                
                <div className="w-full px-6 py-4 flex items-center justify-between hover:bg-zinc-800/80 transition-colors group">
                  <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => setExpanded(expanded === customer.id ? null : customer.id)}>
                    <Server className="text-orange-500 w-6 h-6" />
                    <span className="text-xl font-black text-white uppercase tracking-wider">{customer.name || 'Unknown Client'}</span>
                    <span className="bg-zinc-800 text-orange-300 text-xs px-2 py-1 rounded-sm border border-zinc-700 font-bold">
                      {Array.isArray(customer?.clusters) ? customer.clusters.length : 0} Assets
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setEditModal({ customerId: customer.id, cluster: { name: '', version: DEFAULT_VERSION, hotfix: 'Take ', model: 'Quantum 9200', clusterType: 'Cluster', status: '', note: '' } })}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-xs bg-zinc-800 hover:bg-orange-950 text-orange-400 px-3 py-1 border border-orange-500/40 flex items-center gap-1 font-bold rounded-sm"
                    >
                      <Plus className="w-3 h-3" /> Add Asset
                    </button>
                    <button 
                      onClick={(e) => handleDeleteClient(customer.id, customer.name, e)}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-xs bg-red-950/60 hover:bg-red-900 text-red-400 px-2.5 py-1 border border-red-500/30 flex items-center gap-1 font-bold rounded-sm"
                      title="Delete Client Perimeter"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-300 cursor-pointer ${expanded === customer.id ? 'rotate-180' : ''}`} onClick={() => setExpanded(expanded === customer.id ? null : customer.id)} />
                  </div>
                </div>

                <div className={`grid transition-all duration-300 ease-in-out ${expanded === customer.id ? 'grid-rows-[1fr] opacity-100 border-t border-zinc-800' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-zinc-950/60 shadow-inner">
                      {Array.isArray(customer?.clusters) && customer.clusters.length > 0 ? (
                        customer.clusters.map((cluster: any) => {
                          const statusStyles = getStatusColor(cluster.version, cluster.hotfix);
                          
                          return (
                            <div key={cluster.id || Math.random()} className={`p-4 bg-zinc-900 border border-zinc-800 border-l-4 ${statusStyles} flex flex-col gap-3 relative group transition-all duration-300 hover:shadow-md rounded-sm`}>
                              
                              <div className="flex justify-between items-start">
                                <h3 className="font-black text-white tracking-widest uppercase flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                  {cluster.name || 'Unnamed Asset'}
                                  <span className="text-[10px] bg-orange-950/80 text-orange-300 px-2 py-0.5 rounded border border-orange-500/30 normal-case font-bold">
                                    {cluster.clusterType || 'Cluster'}
                                  </span>
                                </h3>
                                <button 
                                  onClick={() => setEditModal({ customerId: customer.id, cluster })}
                                  className="text-xs bg-zinc-800 hover:bg-orange-950 text-orange-300 px-3 py-1 transition-colors opacity-0 group-hover:opacity-100 border border-orange-500/30 rounded-sm font-bold"
                                >
                                  EDIT
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                                <div>
                                  <div className="text-zinc-400 text-[10px] uppercase mb-1 tracking-wider font-bold">Version</div>
                                  <div className="font-bold text-white text-xs">{cluster.version || 'Unknown'}</div>
                                </div>
                                <div>
                                  <div className="text-zinc-400 text-[10px] uppercase mb-1 tracking-wider font-bold">Model</div>
                                  <div className="font-bold text-orange-400 text-xs flex items-center gap-1">
                                    <Cpu className="w-3 h-3" /> {cluster.model || 'Quantum 9200'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-zinc-400 text-[10px] uppercase mb-1 tracking-wider font-bold">JHF Level</div>
                                  <div className={`font-black text-xs ${statusStyles.includes('text-emerald-') ? 'text-emerald-400' : statusStyles.includes('text-amber-') ? 'text-amber-400' : statusStyles.includes('text-orange-') ? 'text-orange-400' : 'text-zinc-400'}`}>
                                    {String(cluster.hotfix || 'Unknown')}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="mt-2 bg-zinc-950 p-2.5 text-xs text-zinc-300 border border-zinc-800 font-sans italic rounded-sm leading-relaxed">
                                <span className="text-orange-400 font-bold uppercase not-italic mr-1 text-[10px]">Status:</span> 
                                {cluster.status || 'No status provided.'}
                              </div>

                              {cluster.note && (
                                <div className="mt-1 bg-orange-950/30 p-2.5 text-xs text-orange-200 border border-orange-500/30 font-sans rounded-sm flex items-start gap-2">
                                  <FileText className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-bold uppercase tracking-wider text-[10px] block text-orange-400">Special Note:</span>
                                    {cluster.note}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-zinc-500 italic text-sm py-4 w-full col-span-full text-center">
                          No assets configured for this client perimeter. Click "+ Add Asset" to deploy.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
             <div className="text-zinc-500 italic p-6 bg-zinc-900 border border-zinc-800 rounded-sm text-center">
               No client perimeters found in database.
             </div>
          )}
        </div>
      </main>

      {/* RECYCLE BIN MODAL */}
      {showRecycleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.2)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] rounded-sm">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <ArchiveRestore className="w-5 h-5 text-orange-400" />
                <h3 className="font-black tracking-widest uppercase text-orange-400 text-xs">Recycle Bin - Undo Changes</h3>
              </div>
              <button onClick={() => setShowRecycleModal(false)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-3 flex-1 bg-zinc-950">
              {Array.isArray(data.recycle) && data.recycle.length > 0 ? data.recycle.map((e: any) => (
                <div key={e.id} className={`bg-zinc-900 p-3.5 border rounded-sm text-xs flex items-center justify-between gap-4 ${e.restoredAt ? 'border-zinc-800 opacity-50' : 'border-zinc-700'}`}>
                  <div className="space-y-1 min-w-0">
                    <div className="text-zinc-100 font-bold">{describeEntry(e)}</div>
                    <div className="text-[10px] text-zinc-500">
                      {e.userName || 'ENGINEER'} ({e.userEmail}) - {new Date(e.timestamp).toLocaleString()}
                    </div>
                    {!e.restoredAt && !e.after && ['add_client', 'add_cluster', 'edit_cluster'].includes(e.kind) && <div className="text-[10px] text-amber-400">Legacy history: cannot safely undo without a saved after-state.</div>}
                    {e.restoredAt && <div className="text-[10px] text-emerald-400 font-bold">Undone by {e.restoredBy} - {new Date(e.restoredAt).toLocaleString()}</div>}
                  </div>
                  {!e.restoredAt && (e.after || !['add_client', 'add_cluster', 'edit_cluster'].includes(e.kind)) && (
                    <button
                      onClick={() => handleUndo(e.id)}
                      disabled={undoingId === e.id}
                      className="shrink-0 flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold uppercase tracking-widest px-3 py-2 border border-orange-400 rounded-sm"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> {undoingId === e.id ? 'Undoing...' : 'Undo'}
                    </button>
                  )}
                </div>
              )) : (
                <div className="text-zinc-500 text-center py-8 italic">Recycle bin is empty. Changes you make will appear here so they can be undone.</div>
              )}
            </div>
            <div className="bg-zinc-800 px-6 py-3 border-t border-zinc-700 flex justify-end">
              <button onClick={() => setShowRecycleModal(false)} className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.2)] w-full max-w-md overflow-hidden rounded-sm">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <FileBarChart className="w-5 h-5 text-orange-400" />
                <h3 className="font-black tracking-widest uppercase text-orange-400 text-xs">Generate Report</h3>
              </div>
              <button onClick={() => setShowReportModal(false)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Report Scope</label>
                <select value={reportScope} onChange={(e) => setReportScope(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm rounded-sm">
                  <option value="all">All Clients / All Assets</option>
                  {data.customers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.clusters?.length || 0} assets)</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleOpenReport} className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest text-xs py-3 border border-orange-400 rounded-sm">
                  <Printer className="w-4 h-4" /> PDF / Print
                </button>
                <button onClick={handleDownloadCsv} className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-orange-300 font-bold uppercase tracking-widest text-xs py-3 border border-orange-500/40 rounded-sm">
                  <Download className="w-4 h-4" /> Excel (CSV)
                </button>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed">PDF / Print opens the report in a new tab. Use the Print / Save as PDF button there. Comparison is with the latest published Check Point JHF Take, not the recommended production Take. Always check the vendor advisory and client approvals.</p>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOG MODAL */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.2)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh] rounded-sm">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-orange-400" />
                <h3 className="font-black text-white tracking-widest uppercase text-orange-400 text-xs">
                  System Audit Trail & Activity Log (IP Tracked)
                </h3>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-3 font-mono flex-1 bg-zinc-950">
              {Array.isArray(data.logs) && data.logs.length > 0 ? (
                data.logs.map((log: any) => (
                  <div key={log.id} className="bg-zinc-900 p-3.5 border border-zinc-800 rounded-sm text-xs space-y-1.5 shadow-sm">
                    <div className="flex justify-between items-center text-zinc-400">
                      <span className="text-orange-400 font-black">{log.userName || 'ENGINEER'} <span className="text-zinc-500 font-normal">({log.userEmail})</span></span>
                      <span className="bg-zinc-950 px-2 py-0.5 rounded text-[10px] border border-zinc-800 text-orange-300 font-bold">IP: {log.ipAddress || 'Unknown'}</span>
                    </div>
                    <div className="text-zinc-100 font-bold">{log.description}</div>
                    <div className="text-[10px] text-zinc-500 text-right">{new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 text-center py-8 italic">No audit log history recorded yet.</div>
              )}
            </div>

            <div className="bg-zinc-800 px-6 py-3 border-t border-zinc-700 flex justify-end">
              <button onClick={() => setShowLogModal(false)} className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-4 py-2 text-xs uppercase font-bold tracking-wider rounded-sm">
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CLUSTER MODAL */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.2)] w-full max-w-lg overflow-hidden rounded-sm">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
              <h3 className="font-black text-white tracking-widest uppercase text-orange-400 text-xs">
                {editModal.cluster.id ? 'Edit Asset / Cluster' : 'Deploy New Asset / Cluster'}
              </h3>
              <button onClick={() => setEditModal(null)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveCluster} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Asset / Cluster Name</label>
                <input name="name" defaultValue={editModal.cluster.name} required className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-2 focus:outline-none focus:border-orange-500 transition-colors rounded-sm text-sm" placeholder="e.g. Production Cluster / Primary MGMT" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Deployment Type</label>
                  <select name="clusterType" defaultValue={editModal.cluster.clusterType || "Cluster"} className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm rounded-sm">
                    <option value="Cluster">Cluster (HA)</option>
                    <option value="Single GW">1 GW (Single)</option>
                    <option value="MGMT">MGMT (Management)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Version</label>
                  <select name="version" defaultValue={editModal.cluster.version} className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm rounded-sm">
                    {CP_VERSIONS.map((v) => (
                      <option key={v.id} value={v.id}>{v.id}</option>
                    ))}
                    {editModal.cluster.version && !CP_VERSIONS.some((v) => v.id === editModal.cluster.version) && (
                      <option value={editModal.cluster.version}>{editModal.cluster.version}</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Device Model</label>
                  <input name="model" defaultValue={editModal.cluster.model || "Quantum 9200"} required className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm rounded-sm" placeholder="e.g. Quantum 9200 / Smart-1" />
                </div>
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">JHF Level</label>
                  <input name="hotfix" defaultValue={editModal.cluster.hotfix} required className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm rounded-sm" placeholder="e.g. Take 141" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Implementation Status</label>
                <textarea name="status" defaultValue={editModal.cluster.status} required rows={2} className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-2 focus:outline-none focus:border-orange-500 resize-none text-sm rounded-sm" placeholder="e.g. Upgraded successfully" />
              </div>

              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Special Note</label>
                <textarea name="note" defaultValue={editModal.cluster.note} rows={2} className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-2 focus:outline-none focus:border-orange-500 resize-none text-sm rounded-sm" placeholder="e.g. Requires maintenance window approval from client ISO." />
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-zinc-800 mt-6">
                {editModal.cluster.id ? (
                  <button type="button" onClick={handleDeleteCluster} className="text-xs text-red-400 hover:text-red-300 uppercase tracking-widest px-4 py-2 border border-red-500/30 hover:bg-red-950/30 transition-colors font-bold rounded-sm">
                    Delete Asset
                  </button>
                ) : <div></div>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditModal(null)} className="text-xs text-zinc-400 hover:text-white uppercase tracking-widest px-4 py-2 transition-colors">Cancel</button>
                  <button type="submit" className="text-xs bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest px-6 py-2 transition-colors shadow-[0_0_15px_rgba(249,115,22,0.4)] rounded-sm">
                    Save Asset
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slower Ticker Keyframes (40 seconds) */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
      `}} />
    </div>
  );
}