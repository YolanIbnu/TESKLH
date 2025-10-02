"use client"

import { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { supabase } from "../../../lib/supabaseClient";
import { toast } from "../../../lib/toast";
import { X, CheckCircle, Users, Info, Send } from "lucide-react";
import { DOCUMENT_REQUIREMENTS, TODO_ITEMS, FileAttachment } from "../../types";
import { FileViewer } from "../FileViewer";

export function ReportDetailsModal({ report, profiles, onClose }) {
  const { state } = useApp();
  const { currentUser } = state;

  // State untuk data dan UI
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [documentVerification, setDocumentVerification] = useState({});
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [selectedTodos, setSelectedTodos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);

  // Efek untuk mengisi state modal dengan data yang ada dari laporan
  useEffect(() => {
    if (report) {
      // Mengisi state verifikasi dokumen dari data yang ada
      setDocumentVerification(report.document_verification || {});
      
      const existingAssignments = report.task_assignments;
      // Mengisi state to-do dan catatan jika sudah ada penugasan sebelumnya
      if (existingAssignments && existingAssignments.length > 0) {
        // Asumsi todo_list dan notes sama untuk semua staff dalam satu laporan
        setSelectedTodos(existingAssignments[0].todo_list || []);
        setNotes(existingAssignments[0].notes || "");
      } else {
        // Reset jika tidak ada penugasan
        setSelectedTodos([]);
        setNotes("");
      }
    }
  }, [report]);

  // Efek untuk mengambil file lampiran
  useEffect(() => {
    const fetchAttachments = async () => {
      if (!report?.id) return;
      setIsLoadingFiles(true);
      try {
        const { data, error } = await supabase.from("file_attachments").select("*").eq("report_id", report.id);
        if (error) throw error;
        const formattedData = data.map(file => ({
          id: file.id,
          fileName: file.file_name,
          fileUrl: file.file_url,
          uploadedBy: "Pengunggah", // Bisa diganti jika ada data uploader
          uploadedAt: file.created_at,
        }));
        setAttachments(formattedData || []);
      } catch (error) {
        toast.error("Gagal memuat lampiran file.");
      } finally {
        setIsLoadingFiles(false);
      }
    };
    fetchAttachments();
  }, [report?.id]);

  // Tampilkan loading jika data utama belum siap
  if (!report || !profiles) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-4 rounded">Memuat data...</div>
      </div>
    );
  }

  // Fungsi helper untuk mendapatkan nama profil
  const getProfileName = (profileId) => {
    if (!profileId) return "Sistem";
    const profile = profiles.find((p) => p.id === profileId || p.user_id === profileId);
    return profile?.full_name || "ID Tidak Dikenali";
  };

  // Logika untuk verifikasi dokumen
  const requiredDocs = DOCUMENT_REQUIREMENTS[report.layanan] || [];
  const allDocsPresent = requiredDocs.length > 0 && requiredDocs.every((doc) => documentVerification[doc] === "Ada");

  // Handler untuk perubahan input
  const handleStaffChange = (staffProfileId, checked) => setSelectedStaffIds(prev => checked ? [...prev, staffProfileId] : prev.filter(id => id !== staffProfileId));
  const handleTodoChange = (todoTask, checked) => setSelectedTodos(prev => checked ? [...prev, todoTask] : prev.filter(t => t !== todoTask));
  const handleDocumentChange = (doc, status) => setDocumentVerification((prev) => ({ ...prev, [doc]: status }));

  // Fungsi untuk menugaskan staff baru
  const handleAssignTasks = async () => {
    if (selectedStaffIds.length === 0) {
      toast.error("Pilih minimal satu staff baru untuk ditugaskan.");
      return;
    }
    setIsSubmitting(true);
    try {
      const coordinatorProfile = profiles.find(p => p.user_id === currentUser?.id);
      if (!coordinatorProfile) throw new Error("Gagal memverifikasi profil koordinator.");

      const taskAssignmentsData = selectedStaffIds.map(staffProfileId => ({
        report_id: report.id,
        staff_id: staffProfileId,
        coordinator_id: coordinatorProfile.id,
        todo_list: selectedTodos,
        status: 'in-progress',
        notes: notes,
      }));

      const { error: taskInsertError } = await supabase.from('task_assignments').insert(taskAssignmentsData);
      if (taskInsertError) throw new Error(`Gagal menyimpan tugas: ${taskInsertError.message}`);

      const selectedStaffNames = profiles.filter(p => selectedStaffIds.includes(p.id)).map(p => p.full_name).join(', ');
      await supabase.from('workflow_history').insert({
        report_id: report.id,
        action: 'Laporan ditugaskan',
        user_id: currentUser?.id,
        status: 'in-progress',
        notes: `Ditugaskan kepada: ${selectedStaffNames}.`,
      });

      await supabase.from('reports').update({
        status: 'in-progress',
        current_holder: currentUser.id,
        document_verification: documentVerification,
      }).eq('id', report.id);

      toast.success(`Tugas berhasil ditugaskan!`);
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fungsi untuk meneruskan laporan ke TU
  const handleForwardToTU = async () => {
    setIsForwarding(true);
    try {
      const { error: updateError } = await supabase
        .from('reports')
        .update({ status: 'pending-approval-tu', current_holder: null })
        .eq('id', report.id);
      if (updateError) throw updateError;
      
      await supabase.from('workflow_history').insert({
        report_id: report.id,
        action: 'Laporan disetujui dan diteruskan ke TU',
        user_id: currentUser?.id,
        status: 'pending-approval-tu',
        notes: `Semua tugas telah selesai, laporan diteruskan untuk persetujuan TU.`,
      });

      toast.success("Laporan berhasil diteruskan ke TU!");
      onClose();

    } catch (error) {
      toast.error("Gagal meneruskan laporan: " + error.message);
    } finally {
      setIsForwarding(false);
    }
  };
  
  // Data turunan untuk UI
  const assignedTasks = report.task_assignments || [];
  const alreadyAssignedStaffIds = assignedTasks.map(a => a.staff_id);
  const availableStaff = profiles.filter(p => p.role === 'Staff' && p.id && !alreadyAssignedStaffIds.includes(p.id));
  const allTasksCompleted = assignedTasks.length > 0 && assignedTasks.every(task => task.status === 'completed');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold">Detail Laporan: {report.no_surat}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800"><X /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Detail Surat */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Info className="text-blue-500" /> Detail Surat</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm p-4 bg-gray-50 rounded-lg border">
              <div>No. Surat:</div><div>{report.no_surat || "-"}</div>
              <div>Perihal:</div><div>{report.hal || "-"}</div>
              <div>Jenis Layanan:</div><div>{report.layanan || "-"}</div>
              <div>Dari:</div><div>{getProfileName(report.created_by)}</div>
            </div>
          </div>
          
          {/* Lampiran */}
          <div>
            {isLoadingFiles ? (<p className="text-center py-4 text-gray-500">Memuat file...</p>) : (<FileViewer files={attachments} title="File Lampiran" />)}
          </div>
          <hr />
          
          {/* Verifikasi Dokumen */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><CheckCircle className="text-green-500" /> Verifikasi Dokumen</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requiredDocs.map(doc => (
                <div key={doc} className="p-3 bg-gray-50 rounded-lg border">
                  <p className="font-medium text-sm text-gray-800">{doc}</p>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center cursor-pointer"><input type="radio" name={doc} value="Ada" onChange={() => handleDocumentChange(doc, "Ada")} checked={documentVerification[doc] === "Ada"} /> <span className="ml-2">Ada</span></label>
                    <label className="flex items-center cursor-pointer"><input type="radio" name={doc} value="Tidak Ada" onChange={() => handleDocumentChange(doc, "Tidak Ada")} checked={documentVerification[doc] === "Tidak Ada"} /> <span className="ml-2">Tidak Ada</span></label>
                  </div>
                </div>
              ))}
              {requiredDocs.length === 0 && <p className="text-sm text-gray-500">Tidak ada dokumen yang disyaratkan untuk layanan ini.</p>}
            </div>
          </div>
          <hr />
          
          {/* Penugasan Tugas */}
          {(allDocsPresent || requiredDocs.length === 0) && (
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Users className="text-purple-500" /> Penugasan Tugas</h3>

              {/* Menampilkan staff yang sudah ditugaskan */}
              {assignedTasks.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-medium mb-3 text-gray-800">Staff yang Sudah Ditugaskan:</h4>
                  <ul className="list-disc list-inside bg-gray-50 p-4 rounded-lg border space-y-1">
                    {assignedTasks.map(task => (
                      <li key={task.id} className="text-sm">
                        {getProfileName(task.staff_id)} - <span className={`font-semibold capitalize ${task.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}`}>{task.status.replace('-', ' ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Pilih Staff Baru:</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1 p-2 border rounded-md bg-white">
                    {availableStaff.map((staff) => (
                      <label key={staff.id} className="flex items-center p-2 hover:bg-gray-100 rounded cursor-pointer">
                        <input type="checkbox" onChange={(e) => handleStaffChange(staff.id, e.target.checked)} />
                        <span className="ml-2 text-sm">{staff.full_name}</span>
                      </label>
                    ))}
                    {availableStaff.length === 0 && <p className="text-sm text-gray-500 p-2">Semua staff yang relevan sudah ditugaskan.</p>}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-3">Daftar To-Do:</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto p-2 border rounded-md bg-white">
                    {TODO_ITEMS.map((todo) => (
                      <label key={todo} className="flex items-center p-2 hover:bg-gray-100 rounded cursor-pointer">
                        <input type="checkbox" onChange={(e) => handleTodoChange(todo, e.target.checked)} checked={selectedTodos.includes(todo)} />
                        <span className="ml-2 text-sm">{todo}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2" htmlFor="notes-textarea">Catatan (untuk staff):</label>
                <textarea id="notes-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full p-2 border rounded-lg" />
              </div>

              {/* Tombol Aksi */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <button 
                  onClick={handleAssignTasks} 
                  disabled={isSubmitting || selectedStaffIds.length === 0} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Menugaskan..." : "Tugaskan Staff Baru"}
                </button>

                {/* Tombol untuk meneruskan ke TU, hanya muncul jika semua tugas selesai */}
                {allTasksCompleted && (
                  <button
                    onClick={handleForwardToTU}
                    disabled={isForwarding}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <Send size={16} />
                    {isForwarding ? "Meneruskan..." : "Setujui & Teruskan ke TU"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}