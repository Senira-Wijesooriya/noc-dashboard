"use client";
import { useEffect, useState } from "react";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { ShieldAlert, Server, LogOut, ChevronDown, RefreshCw, Plus, X, FileText, Cpu, Trash2, History, Mail, CheckCircle2 } from "lucide-react";

export default function SOCDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ targets: { "R81.20": "170", "R82": "127" }, customers: [], logs: [], lastUpdated: 0 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Office Mail Verification Modal State
  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [officeMailInput, setOfficeMailInput] = useState("");
  const [verifiedOfficeMail, setVerifiedOfficeMail] = useState("");

  // Modals
  const [editModal, setEditModal] = useState<{customerId: string, cluster: any} | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);

  const loadData = async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      if (json && typeof json === 'object') {
        setData({
          targets: json.targets || { "R81.20": "170", "R82": "127" },
          customers: Array.isArray(json.customers) ? json.customers : [],
          logs: Array.isArray(json.logs) ? json.logs : [],
          lastUpdated: json.lastUpdated || 0
        });
      }
    } catch (e) {
      console.error("Failed to fetch data.", e);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Check if office mail is already stored in localStorage for this session
        const savedOfficeMail = localStorage.getItem(`office_mail_${u.uid}`);
        if (savedOfficeMail) {
          setVerifiedOfficeMail(savedOfficeMail);
          setShowOfficeModal(false);
        } else {
          setShowOfficeModal(true); // Trigger office mail popup prompt
        }
        loadData();
        const interval = setInterval(loadData, 300000);
        return () => clearInterval(interval);
      } else {
        setUser(null);
        setVerifiedOfficeMail("");
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const login = async () => {
    try { 
      await signInWithPopup(auth, googleProvider); 
    } catch (e: any) { 
      alert(`Firebase Error: ${e.message}`); 
    }
  };

  const handleOfficeMailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = officeMailInput.trim().toLowerCase();
    
    // Strict Domain Validation
    if (!mail.endsWith('@mitesp.com') && !mail.endsWith('@millenniumitesp.com')) {
      alert("Access Denied: Office mail must end with @mitesp.com or @millenniumitesp.com");
      return;
    }

    setVerifiedOfficeMail(mail);
    localStorage.setItem(`office_mail_${user.uid}`, mail);
    setShowOfficeModal(false);

    // Send login audit log capturing both Gmail and Office Mail
    await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "update_customers", 
        customers: data.customers,
        logDescription: `User authenticated via Gmail (${user.email}) | Office Mail Verified: ${mail}`,
        userEmail: mail,
        userName: `${mail.split('@')[0]} (Gmail: ${user.email})`
      })
    });
    loadData();
  };

  const handleForceSync = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "force_sync",
          userEmail: verifiedOfficeMail,
          userName: `${verifiedOfficeMail.split('@')[0]} (Gmail: ${user?.email})`
        })
      });
      if (res.ok) await loadData();
    } catch (e) { console.error(e); }
    setIsUpdating(false);
  };

  const saveCustomersToDB = async (updatedCustomers: any, logDesc: string) => {
    setData({ ...data, customers: updatedCustomers });
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "update_customers", 
        customers: updatedCustomers,
        logDescription: `${logDesc} | Executed by Office Mail: ${verifiedOfficeMail} (Gmail: ${user?.email})`,
        userEmail: verifiedOfficeMail,
        userName: `${verifiedOfficeMail.split('@')[0]} (Gmail: ${user?.email})`
      })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.logs) setData((prev: any) => ({ ...prev, logs: json.logs }));
    }
  };

  const handleAddClient = () => {
    const name = prompt("Enter new Client Perimeter Name (e.g. Seylan, Commercial Bank):");
    if (!name) return;
    
    const newCustomer = {
      id: `c_${Date.now()}`,
      name: name.toUpperCase(),
      clusters: []
    };
    saveCustomersToDB([...data.customers, newCustomer], `Added client perimeter: ${name.toUpperCase()}`);
  };

  const handleDeleteClient = (customerId: string, customerName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete client perimeter "${customerName}" and all its clusters?`)) return;

    const updatedCustomers = data.customers.filter((c: any) => c.id !== customerId);
    saveCustomersToDB(updatedCustomers, `Deleted client perimeter: ${customerName}`);
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

    const actionText = isNew ? `Deployed cluster "${clusterName}"` : `Updated cluster "${clusterName}"`;
    saveCustomersToDB(updatedCustomers, actionText);
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

    saveCustomersToDB(updatedCustomers, `Deleted cluster "${clusterName}"`);
    setEditModal(null);
  };

  const getStatusColor = (version: string, currentTake: any) => {
    const targetTakeStr = String(data?.targets?.[version] || '');
    const currentTakeStr = String(currentTake || '');
    if (!targetTakeStr || !currentTakeStr || currentTakeStr === 'undefined') return "border-zinc-700 text-zinc-400"; 
    
    const current = parseInt(currentTakeStr.replace(/\D/g, '')) || 0;
    const target = parseInt(targetTakeStr.replace(/\D/g, '')) || 0;

    if (current >= target) return "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-emerald-400";
    if (current >= target - 20) return "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] text-amber-400";
    return "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)] text-orange-400";
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-orange-500 font-mono tracking-widest">INITIALIZING MITESP SECURE SHIPYARD...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white font-mono relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a2e_1px,transparent_1px),linear-gradient(to_bottom,#27272a2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        <div className="z-10 bg-zinc-900 border border-orange-500/40 p-12 shadow-[0_0_50px_rgba(249,115,22,0.2)] text-center max-w-md w-full">
          <img src="/MillenniumIT_ESP.png" alt="MillenniumIT ESP" className="h-16 w-auto mx-auto mb-6 bg-white/5 p-2 rounded object-contain" />
          <h1 className="text-2xl font-black tracking-widest text-white mb-1 uppercase">Check Point Shipyard</h1>
          <p className="text-orange-400 text-xs mb-8 tracking-widest uppercase">Fleet Command Center</p>
          <button onClick={login} className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 transition-all uppercase tracking-widest border-2 border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)] flex items-center justify-center gap-3">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.24 10.28V14h5.52c-.24 1.44-1.68 4.2-5.52 4.2-3.32 0-6.04-2.76-6.04-6.16s2.72-6.16 6.04-6.16c1.88 0 3.16.8 3.88 1.48l2.96-2.88C17.32 2.92 14.96 2 12.24 2 6.92 2 2.6 6.32 2.6 11.64s4.32 9.64 9.64 9.64c5.56 0 9.24-3.92 9.24-9.44 0-.64-.08-1.12-.24-1.56H12.24z"/></svg>
            Authenticate via Google
          </button>
        </div>
      </div>
    );
  }

  // OFFICE MAIL VERIFICATION MODAL POPUP
  if (showOfficeModal) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-mono">
        <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_40px_rgba(249,115,22,0.3)] max-w-md w-full p-8 rounded-sm">
          <div className="text-center mb-6">
            <Mail className="w-12 h-12 text-orange-500 mx-auto mb-3 animate-bounce" />
            <h2 className="text-xl font-black text-white uppercase tracking-wider">Office Mail Verification</h2>
            <p className="text-xs text-zinc-400 mt-2">
              Logged in via Gmail (<span className="text-orange-400">{user.email}</span>). Please enter your official corporate office mail to continue.
            </p>
          </div>

          <form onSubmit={handleOfficeMailSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-orange-400 font-bold uppercase mb-1">Office Email Address</label>
              <input 
                type="email" 
                required 
                value={officeMailInput} 
                onChange={(e) => setOfficeMailInput(e.target.value)} 
                placeholder="name@mitesp.com" 
                className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-3 text-sm focus:outline-none focus:border-orange-500"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">Must end with @mitesp.com or @millenniumitesp.com</span>
            </div>

            <button type="submit" className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 transition-all uppercase tracking-widest text-xs border border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              Verify & Proceed to Shipyard
            </button>
          </form>

          <div className="mt-6 text-center border-t border-zinc-800 pt-4">
            <button onClick={() => signOut(auth)} className="text-xs text-zinc-500 hover:text-red-400 underline uppercase tracking-wider">
              Sign out & use a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono flex flex-col selection:bg-orange-950">
      
      {/* LIVE INTELLIGENCE TICKER */}
      <div className="bg-orange-950/90 border-b border-orange-500/60 text-orange-300 py-1.5 overflow-hidden whitespace-nowrap relative flex items-center">
        <div className="animate-[marquee_20s_linear_infinite] inline-block font-bold tracking-widest text-sm w-full">
          🔥 MITESP SHIPYARD INTEL: TARGET JUMBO HOTFIX DEPLOYMENT REQUIRED 
          <span className="text-white mx-4">|</span> R81.20: TARGET TAKE {data?.targets?.["R81.20"] || '170'} 
          <span className="text-white mx-4">|</span> R82: TARGET TAKE {data?.targets?.["R82"] || '127'} 
          <span className="text-white mx-4">|</span> ALL CLUSTERS SECURED 🔥
        </div>
      </div>

      {/* NAVBAR */}
      <nav className="border-b border-zinc-800 bg-zinc-900/90 px-6 py-3 flex justify-between items-center backdrop-blur-md sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white px-3 py-1.5 rounded flex items-center shadow-sm">
            <img src="/MillenniumIT_ESP.png" alt="MillenniumIT ESP" className="h-8 w-auto object-contain" />
          </div>
          <div className="border-l border-zinc-700 pl-4">
            <h1 className="text-base font-black text-white tracking-widest leading-none">CHECK POINT SHIPYARD</h1>
            <span className="text-[11px] text-orange-400 tracking-[0.2em] font-bold">ENTERPRISE SECURITY MATRIX</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-2 border border-zinc-700 uppercase tracking-widest transition-colors"
          >
            <History className="w-4 h-4 text-orange-400" />
            Audit Logs ({data?.logs?.length || 0})
          </button>

          <div className="flex flex-col items-end">
            <button onClick={handleForceSync} disabled={isUpdating} className="flex items-center gap-2 text-xs bg-orange-950 hover:bg-orange-900 text-orange-400 px-4 py-1.5 border border-orange-500/40 uppercase tracking-widest transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Syncing...' : 'Force CP Sync'}
            </button>
            <span className="text-[10px] text-zinc-400 mt-1 mr-1">
              Last Scrape: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : 'Unknown'}
            </span>
          </div>

          <div className="text-right hidden md:block pl-6 border-l border-zinc-800">
            <div className="text-sm font-bold text-orange-400 uppercase">{verifiedOfficeMail}</div>
            <div className="text-xs text-zinc-400 font-semibold tracking-wider">Cyber Security Engineer <span className="text-[10px] text-zinc-500">(Gmail: {user?.email})</span></div>
          </div>
          <button onClick={() => { localStorage.clear(); signOut(auth); }} className="text-zinc-400 hover:text-orange-400 transition-colors" title="Log Out"><LogOut className="w-5 h-5" /></button>
        </div>
      </nav>

      {/* DASHBOARD CONTENT */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        
        <div className="flex justify-between items-end mb-8 border-b border-zinc-800 pb-4 mt-4">
          <h2 className="text-2xl text-white font-bold uppercase tracking-wider">Client Perimeters</h2>
          <button onClick={handleAddClient} className="bg-zinc-900 hover:bg-zinc-800 text-orange-400 border border-orange-500/40 px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors shadow-[0_0_10px_rgba(249,115,22,0.15)] hover:shadow-[0_0_15px_rgba(249,115,22,0.3)]">
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
                    <span className="text-xl font-bold text-white uppercase tracking-wider">{customer.name || 'Unknown Client'}</span>
                    <span className="bg-zinc-800 text-orange-300 text-xs px-2 py-1 rounded-sm border border-zinc-700">
                      {Array.isArray(customer?.clusters) ? customer.clusters.length : 0} Clusters
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setEditModal({ customerId: customer.id, cluster: { name: '', version: 'R81.20', hotfix: 'Take ', model: 'Quantum 9200', clusterType: 'Cluster', status: '', note: '' } })}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-zinc-800 hover:bg-orange-950 text-orange-400 px-3 py-1 border border-orange-500/40 flex items-center gap-1 font-bold"
                    >
                      <Plus className="w-3 h-3" /> Add Cluster
                    </button>
                    <button 
                      onClick={(e) => handleDeleteClient(customer.id, customer.name, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-red-950/60 hover:bg-red-900 text-red-400 px-2.5 py-1 border border-red-500/30 flex items-center gap-1 font-bold rounded-sm"
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
                            <div key={cluster.id || Math.random()} className={`p-4 bg-zinc-900 border-l-4 ${statusStyles} flex flex-col gap-3 relative group transition-all duration-300 hover:bg-zinc-800/80 shadow-md`}>
                              
                              <div className="flex justify-between items-start">
                                <h3 className="font-extrabold text-white tracking-widest uppercase flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                  {cluster.name || 'Unnamed Cluster'}
                                  <span className="text-[10px] bg-orange-950/80 text-orange-300 px-2 py-0.5 rounded border border-orange-500/30 normal-case font-normal">
                                    {cluster.clusterType || 'Cluster'}
                                  </span>
                                </h3>
                                <button 
                                  onClick={() => setEditModal({ customerId: customer.id, cluster })}
                                  className="text-xs bg-zinc-800 hover:bg-orange-950 text-orange-300 px-3 py-1 transition-colors opacity-0 group-hover:opacity-100 border border-orange-500/30 rounded-sm font-bold"
                                >
                                  EDIT CLUSTER
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-sm mt-1">
                                <div>
                                  <div className="text-zinc-400 text-[10px] uppercase mb-1 tracking-wider font-semibold">Version</div>
                                  <div className="font-bold text-white text-xs">{cluster.version || 'Unknown'}</div>
                                </div>
                                <div>
                                  <div className="text-zinc-400 text-[10px] uppercase mb-1 tracking-wider font-semibold">Model</div>
                                  <div className="font-bold text-orange-400 text-xs flex items-center gap-1">
                                    <Cpu className="w-3 h-3" /> {cluster.model || 'Quantum 9200'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-zinc-400 text-[10px] uppercase mb-1 tracking-wider font-semibold">JHF Level</div>
                                  <div className={`font-black text-xs ${statusStyles.split(' ')[2]}`}>
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
                          No clusters configured for this client perimeter. Click "+ Add Cluster" to deploy.
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

      {/* AUDIT LOG MODAL */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.2)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-orange-400" />
                <h3 className="font-extrabold text-white tracking-widest uppercase text-orange-400 text-sm">
                  System Audit Trail & Activity Log (Dual-Email Tracked)
                </h3>
              </div>
              <button onClick={() => setShowLogModal(false)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-3 font-mono flex-1">
              {Array.isArray(data.logs) && data.logs.length > 0 ? (
                data.logs.map((log: any) => (
                  <div key={log.id} className="bg-zinc-950 p-3 border border-zinc-800 rounded text-xs space-y-1">
                    <div className="flex justify-between items-center text-zinc-400">
                      <span className="text-orange-400 font-bold">{log.userName || 'Engineer'} <span className="text-zinc-500 font-normal">({log.userEmail})</span></span>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-zinc-200 font-semibold">{log.description}</div>
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 text-center py-8 italic">No audit log history recorded yet.</div>
              )}
            </div>

            <div className="bg-zinc-950 px-6 py-3 border-t border-zinc-800 flex justify-end">
              <button onClick={() => setShowLogModal(false)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-xs uppercase font-bold tracking-wider">
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CLUSTER MODAL */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-orange-500/60 shadow-[0_0_30px_rgba(249,115,22,0.2)] w-full max-w-lg overflow-hidden">
            <div className="bg-zinc-800 px-6 py-4 flex justify-between items-center border-b border-zinc-700">
              <h3 className="font-extrabold text-white tracking-widest uppercase text-orange-400">
                {editModal.cluster.id ? 'Edit Cluster' : 'Deploy New Cluster'}
              </h3>
              <button onClick={() => setEditModal(null)} className="text-zinc-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleSaveCluster} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Cluster Name</label>
                <input name="name" defaultValue={editModal.cluster.name} required className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-2 focus:outline-none focus:border-orange-500 transition-colors" placeholder="e.g. Production Cluster" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Deployment Type</label>
                  <select name="clusterType" defaultValue={editModal.cluster.clusterType || "Cluster"} className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm">
                    <option value="Cluster">Cluster (HA)</option>
                    <option value="Single GW">1 GW (Single)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Version</label>
                  <select name="version" defaultValue={editModal.cluster.version} className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm">
                    <option value="R81.20">R81.20</option>
                    <option value="R82">R82</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Device Model</label>
                  <input name="model" defaultValue={editModal.cluster.model || "Quantum 9200"} required className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm" placeholder="e.g. Quantum 9200" />
                </div>
                <div>
                  <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">JHF Level</label>
                  <input name="hotfix" defaultValue={editModal.cluster.hotfix} required className="w-full bg-zinc-950 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-orange-500 text-sm" placeholder="e.g. Take 141" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Implementation Status</label>
                <textarea name="status" defaultValue={editModal.cluster.status} required rows={2} className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-2 focus:outline-none focus:border-orange-500 resize-none text-sm" placeholder="e.g. Upgraded successfully" />
              </div>

              <div>
                <label className="block text-xs text-orange-400 font-bold uppercase tracking-wider mb-1">Special Note</label>
                <textarea name="note" defaultValue={editModal.cluster.note} rows={2} className="w-full bg-zinc-950 border border-zinc-700 text-white px-4 py-2 focus:outline-none focus:border-orange-500 resize-none text-sm" placeholder="e.g. Requires maintenance window approval from client ISO." />
              </div>

              <div className="pt-4 flex justify-between items-center border-t border-zinc-800 mt-6">
                {editModal.cluster.id ? (
                  <button type="button" onClick={handleDeleteCluster} className="text-xs text-red-400 hover:text-red-300 uppercase tracking-widest px-4 py-2 border border-red-500/30 hover:bg-red-950/30 transition-colors font-bold">
                    Delete Cluster
                  </button>
                ) : <div></div>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditModal(null)} className="text-xs text-zinc-400 hover:text-white uppercase tracking-widest px-4 py-2 transition-colors">Cancel</button>
                  <button type="submit" className="text-xs bg-orange-600 hover:bg-orange-500 text-white font-bold uppercase tracking-widest px-6 py-2 transition-colors shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                    Save Cluster
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
      `}} />
    </div>
  );
}