"use client"

import { useState, useEffect } from "react"
import { useApp } from "../../context/AppContext"
import { SERVICES, Report, User } from "../../types"
import { supabase } from "@/lib/supabaseClient.js"
import { toast } from "../../../lib/toast";
import {
  FileText,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Clock,
  AlertTriangle,
  CheckCircle,
  Edit,
  Trash2,
  Send,
  Package,
  LogOut,
  Archive,
} from "lucide-react"
import { ReportForm } from "../forms/ReportForm"
import { ForwardForm } from "../forms/ForwardForm"

export function TUDashboard() {
  const { state, dispatch } = useApp()
  const { reports, users: profiles, currentUser } = state

  const [showReportForm, setShowReportForm] = useState(false)
  const [showForwardForm, setShowForwardForm] = useState(false)
  const [editingReport, setEditingReport] = useState<Report | null>(null)
  const [forwardingReport, setForwardingReport] = useState<Report | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [serviceFilter, setServiceFilter] = useState("")
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [trackingQuery, setTrackingQuery] = useState("")
  const [trackingResult, setTrackingResult] = useState<any | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [finalizingId, setFinalizingId] = useState<string | null>(null);

  const statusMap: { [key: string]: string } = {
    'draft': 'Draft',
    'in-progress': 'Dalam Proses',
    'completed': 'Selesai',
    'revision-required': 'Revisi',
    'pending-approval-tu': 'Review Koordinator Selesai',
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getProfileName = (profileId: string) => {
    if (!profileId) return "Sistem";
    const profile = profiles.find((p) => p.id === profileId || (p as any).user_id === profileId)
    return profile?.full_name || profile?.name || "ID Tidak Dikenali"
  }
  
  const formatDateTime = (dateString: string) => {
    try {
      if (!dateString) return "-";
      return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch (e) { return "Tanggal Tidak Valid"; }
  };

  const handleFinalizeReport = async (report: Report) => {
    if (!report || !currentUser) return;
    if (!window.confirm(`Anda yakin ingin menyelesaikan dan mengarsipkan laporan "${report.hal}"?`)) return;

    setFinalizingId((report as any).id);
    try {
      const { error: updateError } = await supabase
        .from('reports')
        .update({ status: 'completed', current_holder: null })
        .eq('id', (report as any).id);
      
      if (updateError) throw updateError;
        
      await supabase.from('workflow_history').insert({
        report_id: (report as any).id,
        action: 'Laporan diselesaikan oleh TU',
        user_id: (currentUser as any).user_id || currentUser.id,
        status: 'completed',
        notes: 'Laporan telah final dan diarsipkan.'
      });
      
      toast.success("Laporan telah diselesaikan.");
      if(dispatch) dispatch({ type: 'FETCH_REPORTS' });

    } catch (error: any) {
      toast.error("Gagal menyelesaikan laporan: " + error.message);
    } finally {
      setFinalizingId(null);
    }
  };

  const handleReportSubmit = async (reportData: any) => {
    if (!currentUser) return;
    const reportCreatorId = (currentUser as any).user_id || currentUser.id;
    const reportToSave = {
      no_surat: reportData.noSurat || `NS-${Date.now()}`,
      layanan: reportData.layanan,
      hal: reportData.hal,
      dari: currentUser?.full_name || currentUser?.name || "Pengguna TU",
      status: "draft",
      created_by: reportCreatorId,
    };
    if (editingReport) {
      await supabase.from("reports").update({ ...reportToSave, updated_at: new Date().toISOString() }).eq("id", editingReport.id);
    } else {
      await supabase.from("reports").insert([{ ...reportToSave, created_at: new Date().toISOString() }]);
    }
    setShowReportForm(false);
    setEditingReport(null);
    if(dispatch) dispatch({ type: 'FETCH_REPORTS' });
  };

  const handleDeleteReport = async (reportId: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus laporan ini?")) {
      await supabase.from("reports").delete().eq("id", reportId);
      if(dispatch) dispatch({ type: 'FETCH_REPORTS' });
    }
    setOpenActionMenu(null);
  };

  const handleForwardSubmit = async (forwardData: any) => {
    if (!forwardingReport || !currentUser) return;
    const coordinatorName = forwardData.coordinators[0];
    const coordinatorProfile = profiles.find(p => p.full_name === coordinatorName || p.name === coordinatorName);

    if (!coordinatorProfile) {
      toast.error(`Koordinator "${coordinatorName}" tidak ditemukan.`);
      return;
    }

    await supabase
      .from("reports")
      .update({ 
        current_holder: (coordinatorProfile as any).user_id || coordinatorProfile.id, 
        status: 'in-progress' 
      })
      .eq("id", forwardingReport.id);

    await supabase.from("workflow_history").insert([{
      report_id: forwardingReport.id,
      action: "laporan di teruskan",
      notes: "laporan di lakukan pengecekan dokumen",
      user_id: (currentUser as any).user_id || currentUser.id,
      status: "in-progress" // Sebaiknya status disesuaikan
    }]);

    toast.success(`Laporan berhasil diteruskan ke ${coordinatorProfile.full_name || coordinatorProfile.name}.`);
    
    setShowForwardForm(false);
    setForwardingReport(null);
    if(dispatch) dispatch({ type: 'FETCH_REPORTS' });
  };

  // ... (Sisa fungsi-fungsi helper Anda tetap sama) ...
  const getReportProgress = (report: Report) => {
    // Implementasi progress report Anda
    return 50; // Placeholder
  };
  const getProgressColor = (progress: number) => "bg-blue-500";

  const reportsForFinalization = reports.filter(report => report.status === 'pending-approval-tu');

  const filteredReports = reports.filter((report) => {
    if (report.status === 'pending-approval-tu') return false;
    const matchesService = !serviceFilter || report.layanan === serviceFilter;
    const matchesSearch =
      !searchQuery ||
      report.hal?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.no_surat?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesService && matchesSearch;
  });

  const stats = {
    totalLaporan: reports.length,
    menungguVerifikasi: reports.filter((r) => r.status === "draft").length,
    dalamProses: reports.filter((r) => r.status === "in-progress" || r.status === 'pending-approval-tu').length,
    selesai: reports.filter((r) => r.status === "completed").length,
    dikembalikan: reports.filter((r) => r.status === "revision-required").length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800";
      case "in-progress": return "bg-blue-100 text-blue-800";
      case "draft": return "bg-yellow-100 text-yellow-800";
      case "revision-required": return "bg-red-100 text-red-800";
      case "pending-approval-tu": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleLogout = () => dispatch({ type: "LOGOUT" });
  const resetFilters = () => { setSearchQuery(""); setServiceFilter(""); };

  const { date } = (() => {
    const d = new Date(currentTime);
    return { date: d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) };
  })();

  return (
    // ✅ STRUKTUR JSX YANG DIPERBAIKI
    <div className="min-h-screen bg-gray-50">
      
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Dashboard Tata Usaha</h1>
              <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                <Clock className="w-4 h-4" />
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
                  <div className="text-sm font-medium text-gray-900">{currentUser?.name || "User"}</div>
                  <div className="text-xs text-blue-600">Online</div>
                </div>
                <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white font-medium">
                  {currentUser?.name?.charAt(0).toUpperCase() || "U"}
                </div>
              </div>
            </div>
        </div>
      </div>
      
      {/* Konten Utama */}
      <div className="p-4 sm:p-6">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Manajemen Laporan Kepegawaian</h2>
          <p className="text-sm sm:text-base text-gray-600">Kelola pengajuan dan laporan kepegawaian</p>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* ... Masing-masing card statistik ... */}
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full text-blue-600"><FileText className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.totalLaporan}</div><div className="text-sm text-gray-500">Total Laporan</div></div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-yellow-100 rounded-full text-yellow-600"><AlertTriangle className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.menungguVerifikasi}</div><div className="text-sm text-gray-500">Menunggu Verifikasi</div></div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full text-blue-600"><Package className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.dalamProses}</div><div className="text-sm text-gray-500">Dalam Proses</div></div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-full text-green-600"><CheckCircle className="w-6 h-6" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{stats.selesai}</div><div className="text-sm text-gray-500">Selesai</div></div>
          </div>
        </div>
        
        {/* Bagian Baru untuk Finalisasi */}
        {reportsForFinalization.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Untuk Penyelesaian Akhir</h3>
            <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6 space-y-4">
              {reportsForFinalization.map(report => (
                <div key={(report as any).id} className="flex flex-col sm:flex-row items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div>
                    <p className="font-semibold text-purple-900">{report.no_surat}</p>
                    <p className="text-sm text-purple-700">{report.hal}</p>
                  </div>
                  <button 
                    onClick={() => handleFinalizeReport(report)}
                    disabled={finalizingId === (report as any).id}
                    className="mt-3 sm:mt-0 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    <Archive className="w-4 h-4" />
                    {finalizingId === (report as any).id ? 'Memproses...' : 'Selesaikan & Arsipkan'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end mb-4">
          <button onClick={() => { setEditingReport(null); setShowReportForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base">
            <Plus className="w-4 h-4" />
            Buat Laporan Baru
          </button>
        </div>
        
        {/* Tabel Laporan Utama */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <div className="relative sm:col-span-2 lg:col-span-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm" />
                </div>
                <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="border rounded-lg text-sm">
                  <option value="">Semua Layanan</option>
                  {SERVICES.map((service) => (<option key={service} value={service}>{service}</option>))}
                </select>
                <button onClick={resetFilters} className="flex items-center justify-center gap-2 px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50 text-sm">
                  <Filter className="w-4 h-4" />
                  <span>Reset Filter</span>
                </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">NO SURAT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Layanan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Diajukan Oleh</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReports.map((report) => (
                  <tr key={(report as any).id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{report.no_surat || "-"}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{report.layanan || "-"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">{getProfileName((report as any).created_by)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime((report as any).created_at)}</td>
                    <td className="px-6 py-4 text-sm font-medium">
                        <div className="flex items-center gap-2 relative">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(report.status)}`}>{statusMap[report.status as keyof typeof statusMap] || report.status}</span>
                          <div className="relative">
                            <button onClick={() => setOpenActionMenu(openActionMenu === (report as any).id ? null : (report as any).id)} className="text-gray-600 hover:text-gray-900 p-1 rounded hover:bg-gray-100" title="Menu Lainnya"><MoreHorizontal className="w-4 h-4" /></button>
                            {openActionMenu === (report as any).id && (
                              <div className="absolute right-0 top-8 w-48 bg-white rounded-md shadow-lg border z-10">
                                <div className="py-1">
                                  <button onClick={() => { setEditingReport(report); setShowReportForm(true); setOpenActionMenu(null); }} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"><Edit className="w-4 h-4" />Edit Laporan</button>
                                  <button onClick={() => handleDeleteReport((report as any).id)} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100"><Trash2 className="w-4 h-4" />Hapus</button>
                                  <button onClick={() => { setForwardingReport(report); setShowForwardForm(true); setOpenActionMenu(null); }} className="flex items-center gap-2 w-full px-4 py-2 text-sm text-blue-600 hover:bg-gray-100"><Send className="w-4 h-4" />Teruskan</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">Tidak ada laporan yang sesuai.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showReportForm && (<ReportForm report={editingReport} onSubmit={handleReportSubmit} onCancel={() => { setShowReportForm(false); setEditingReport(null); }} />)}
      {showForwardForm && (<ForwardForm report={forwardingReport} profiles={profiles} onSubmit={handleForwardSubmit} onCancel={() => { setShowForwardForm(false); setForwardingReport(null); }} />)}
    </div>
  )
}