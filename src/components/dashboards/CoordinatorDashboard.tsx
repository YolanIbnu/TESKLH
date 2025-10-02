"use client"

import { useState, useEffect } from "react"
import { useApp } from "../../context/AppContext"
import { supabase } from "../../../lib/supabaseClient"
import { toast } from "../../../lib/toast";
import {
  Filter, UserPlus, AlertTriangle, FileText, Clock,
  CheckCircle, Search, Eye, LogOut, Send, XCircle, Calendar,
} from "lucide-react"
import { Report, SERVICES } from "../../types"
import { ReportDetailsModal } from "../modals/ReportDetailsModal"
import { AddStaffModal } from "../modals/AddStaffModal"
import { RevisionModal } from "../modals/RevisionModal"

export function CoordinatorDashboard() {
  const { state, dispatch } = useApp()
  const { currentUser } = state || {}

  const [localReports, setLocalReports] = useState<Report[]>([])
  const [localProfiles, setLocalProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [serviceFilter, setServiceFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [addStaffReport, setAddStaffReport] = useState<Report | null>(null)
  const [revisionReport, setRevisionReport] = useState<Report | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [forwardingId, setForwardingId] = useState<string | null>(null);

  const fetchData = async (showLoadingSpinner = false) => {
    if (!currentUser?.id) return;
    if (showLoadingSpinner) setLoading(true);

    try {
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('*, task_assignments(*)')
        .or(`status.eq.forwarded-to-coordinator,current_holder.eq.${currentUser.id},status.eq.in-progress,status.eq.revision-required`)
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;
      
      setLocalReports(reportsData || []);

      if (localProfiles.length === 0) {
        const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("*");
        if (profilesError) throw profilesError;
        setLocalProfiles(profilesData || []);
      }
    } catch (error) {
      console.error("Gagal mengambil data:", error);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  const handleQuickForwardToTU = async (report: Report) => {
    if (!report || !currentUser) return;
    
    if (!window.confirm(`Anda yakin ingin meneruskan laporan "${report.hal}" ke TU?`)) {
      return;
    }

    setForwardingId((report as any).id);
    try {
      const { error: updateError } = await supabase
        .from('reports')
        .update({ status: 'pending-approval-tu', current_holder: null })
        .eq('id', (report as any).id);
      if (updateError) throw updateError;
      
      await supabase.from('workflow_history').insert({
        report_id: (report as any).id,
        action: 'Laporan disetujui dan diteruskan ke TU via Aksi Cepat',
        user_id: currentUser?.id,
        status: 'pending-approval-tu',
        notes: `Laporan disetujui oleh Koordinator dari dashboard.`,
      });

      toast.success("Laporan berhasil diteruskan ke TU!");
      fetchData(false);

    } catch (error: any) {
      toast.error("Gagal meneruskan laporan: " + error.message);
    } finally {
      setForwardingId(null);
    }
  };

  useEffect(() => {
    if(currentUser?.id) {
        fetchData(true);
        const pollingInterval = setInterval(() => {
          fetchData(false);
        }, 15000);
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => {
          clearInterval(pollingInterval);
          clearInterval(timer);
        };
    }
  }, [currentUser]);

  const getProfileName = (profileId: string) => {
    if (!profileId || !localProfiles) return "Sistem";
    const profile = localProfiles.find((p) => p.id === profileId || (p as any).user_id === profileId)
    return profile?.full_name || profile?.name || "ID Tidak Dikenali"
  }
  
  const getStatusInfo = (report: Report) => {
    if (report.task_assignments && report.task_assignments.some(a => a.status === 'revision-required')) {
      return { text: 'Perlu Revisi', value: 'revision-required', color: 'text-red-600', icon: XCircle };
    }
    if (report.task_assignments && report.task_assignments.length > 0 && report.task_assignments.every(a => a.status === 'completed')) {
      return { text: 'Menunggu Review', value: 'pending-review', color: 'text-orange-600', icon: Eye };
    }
    if (report.status === 'completed') return { text: 'Selesai', value: 'completed', color: 'text-green-600', icon: CheckCircle };
    if (report.status === 'forwarded-to-coordinator') return { text: 'Perlu Tindakan', value: 'forwarded-to-coordinator', color: 'text-purple-600', icon: Send };
    if (report.status === 'in-progress') return { text: 'Dikerjakan Staff', value: 'in-progress', color: 'text-blue-600', icon: Clock };
    return { text: report.status, value: report.status, color: 'text-gray-600', icon: AlertTriangle };
  };

  const getReportProgress = (report: Report) => {
    if (!report.task_assignments || report.task_assignments.length === 0) {
        if (report.status === 'completed') return 100;
        return 0;
    }
    const completedCount = report.task_assignments.filter(a => a.status === 'completed').length;
    return Math.round((completedCount / report.task_assignments.length) * 100);
  };

  const filteredReports = localReports.filter(report => {
    const matchesService = !serviceFilter || report.layanan === serviceFilter;
    const matchesSearch =
      !searchQuery ||
      report.hal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.no_surat?.toLowerCase().includes(searchQuery.toLowerCase());
    const displayStatusValue = getStatusInfo(report).value;
    const matchesStatus = !statusFilter || displayStatusValue === statusFilter;
    return matchesService && matchesStatus && matchesSearch;
  });
  
  const stats = {
    totalLaporan: localReports.length,
    perluTindakan: localReports.filter(r => r.status === 'forwarded-to-coordinator').length,
    selesai: localReports.filter(r => r.status === 'completed').length,
    revisi: localReports.filter(r => r.task_assignments && r.task_assignments.some(a => a.status === 'revision-required')).length,
  };

  const handleLogout = () => dispatch({ type: "LOGOUT" });

  const { date } = (() => {
    const d = new Date(currentTime);
    return { date: d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) };
  })();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Memuat data koordinator...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-xl font-semibold text-gray-900">Dashboard Koordinator</h1>
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                    <Calendar className="w-4 h-4" />
                    <span>{date}</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <LogOut className="w-4 h-4" />
                    Keluar
                </button>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">{currentUser.name || currentUser.full_name || "Koordinator"}</div>
                        <div className="text-xs text-blue-600">Online</div>
                    </div>
                    <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white font-medium">
                        {(currentUser.name || currentUser.full_name)?.charAt(0).toUpperCase() || "K"}
                    </div>
                </div>
            </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Tugas dan Laporan Masuk</h2>
            <p className="text-sm sm:text-base text-gray-600">Monitor dan kelola laporan yang ditugaskan kepada Anda</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full text-blue-600"><FileText className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.totalLaporan}</div><div className="text-sm text-gray-500">Total Laporan</div></div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-full text-yellow-600"><AlertTriangle className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.perluTindakan}</div><div className="text-sm text-gray-500">Perlu Tindakan</div></div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-full text-green-600"><CheckCircle className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.selesai}</div><div className="text-sm text-gray-500">Selesai</div></div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-full text-red-600"><XCircle className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.revisi}</div><div className="text-sm text-gray-500">Revisi</div></div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="relative sm:col-span-2 lg:col-span-2">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Cari laporan..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
                <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm">
                    <option value="">Semua Layanan</option>
                    {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm">
                    <option value="">Semua Status</option>
                    <option value="forwarded-to-coordinator">Perlu Tindakan</option>
                    <option value="revision-required">Perlu Revisi</option>
                    <option value="pending-review">Menunggu Review</option> 
                    <option value="in-progress">Dikerjakan Staff</option>
                    <option value="completed">Selesai</option>
                </select>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Laporan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Dari</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Progress</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReports.map(report => {
                  const status = getStatusInfo(report);
                  const progress = getReportProgress(report);
                  return (
                    <tr key={(report as any).id}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{report.hal}</div>
                        <div className="text-sm text-gray-500">{report.no_surat}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">{getProfileName((report as any).created_by)}</td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-2 text-sm font-medium ${status.color}`}>
                          <status.icon className="w-4 h-4" />
                          {status.text}
                        </div>
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-gray-200 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${progress === 100 ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${progress}%` }}></div></div>
                          <span className="text-sm font-medium text-gray-600">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSelectedReport(report)} className="text-blue-600 hover:text-blue-900" title="Lihat Detail"><Eye className="w-5 h-5" /></button>
                            <button onClick={() => setAddStaffReport(report)} className="text-gray-600 hover:text-gray-900" title="Tambah Staff"><UserPlus className="w-5 h-5" /></button>
                            <button onClick={() => setRevisionReport(report)} className="text-red-600 hover:text-red-900" title="Revisi / Kembalikan"><AlertTriangle className="w-5 h-5" /></button>
                            
                            {progress === 100 && status.text === 'Menunggu Review' && (
                              <button 
                                onClick={() => handleQuickForwardToTU(report)} 
                                disabled={forwardingId === (report as any).id}
                                className="text-green-600 hover:text-green-900 disabled:text-gray-300 disabled:cursor-wait"
                                title="Setujui & Teruskan ke TU"
                              >
                                {forwardingId === (report as any).id ? <Clock className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredReports.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-gray-500">Tidak ada laporan yang cocok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {selectedReport && <ReportDetailsModal report={selectedReport} profiles={localProfiles} onClose={() => { setSelectedReport(null); fetchData(); }} />}
      {addStaffReport && <AddStaffModal report={addStaffReport} profiles={localProfiles} onClose={() => { setAddStaffReport(null); fetchData(); }} />}
      {revisionReport && <RevisionModal report={revisionReport} profiles={localProfiles} onClose={() => { setRevisionReport(null); fetchData(); }} />}
    </div>
  )
}