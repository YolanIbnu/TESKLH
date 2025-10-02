"use client"

import { useState, useEffect } from "react"
import { useApp } from "../../context/AppContext"
import { supabase } from "../../../lib/supabaseClient"
import {
  Send,
  LogOut,
  FileText,
  ClipboardList,
  MessageSquare,
  AlertCircle
} from "lucide-react"
import { FileViewer } from "../FileViewer"
import { toast } from "../../../lib/toast"
import { StaffTaskCard } from "../StaffTaskCard";

const ReportHeaderInfo = ({ report, profiles }) => {
  const getProfileName = (userId) => {
    if (!userId || !profiles) return "Sistem";
    const profile = profiles.find((p) => p.user_id === userId);
    return profile?.full_name || "Tidak Dikenali";
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <FileText className="text-blue-500" /> Detail Laporan
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm p-4 bg-gray-50 rounded-lg border">
        <div>No. Surat:</div>
        <div className="font-medium">{report?.no_surat || "-"}</div>
        <div>Perihal:</div>
        <div className="font-medium">{report?.hal || "-"}</div>
        <div>Jenis Layanan:</div>
        <div className="font-medium">{report?.layanan || "-"}</div>
        <div>Dari:</div>
        <div className="font-medium">{getProfileName(report?.created_by)}</div>
      </div>
    </div>
  );
};

export function StaffDashboard() {
  const { state, dispatch } = useApp();
  const { currentUser } = state;

  const [assignedTasks, setAssignedTasks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [completedTodos, setCompletedTodos] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const fetchData = async () => {
    if (!currentUser?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: tasksData, error: tasksError } = await supabase
        .from("task_assignments")
        .select("*, reports(*)")
        .eq("staff_id", currentUser.id)
        .in('status', ['in-progress', 'revision-required'])
        .order("created_at", { ascending: false });

      if (tasksError) throw tasksError;
      setAssignedTasks(tasksData || []);

      if (profiles.length === 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name");
        
        if (profilesError) throw profilesError;
        setProfiles(profilesData || []);
      }
    } catch (error) {
      console.error("Gagal mengambil data tugas:", error);
      toast.error("Gagal memuat tugas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
        fetchData();
    }
  }, [currentUser?.id]);
  
  useEffect(() => {
    const fetchAttachments = async () => {
        if (!selectedTask || !selectedTask.reports?.id) {
            setAttachments([]);
            return;
        }

        setLoadingAttachments(true);
        try {
            const { data, error } = await supabase
                .from("file_attachments")
                .select("*")
                .eq("report_id", selectedTask.reports.id);

            if (error) throw error;

            // [PERBAIKAN FINAL] Data diformat dari snake_case ke camelCase
            const formattedData = (data || []).map(file => ({
                id: file.id,
                fileName: file.file_name,
                fileUrl: file.file_url,
                uploadedBy: "Sistem",
                uploadedAt: file.created_at,
            }));
            
            setAttachments(formattedData);

        } catch (error) {
            toast.error("Gagal memuat lampiran file.");
            console.error("Error fetching attachments:", error);
        } finally {
            setLoadingAttachments(false);
        }
    };

    fetchAttachments();
  }, [selectedTask]);

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setCompletedTodos(task.completed_tasks || []);
  };

  const handleToggleTodo = (taskName) => {
    const newCompleted = completedTodos.includes(taskName)
      ? completedTodos.filter(t => t !== taskName)
      : [...completedTodos, taskName];
    setCompletedTodos(newCompleted);
  };

  const handleSubmitWork = async () => {
    if (!selectedTask) return;
    try {
      const { data, error } = await supabase
        .from("task_assignments")
        .update({
            status: "completed",
            progress: 100,
            completed_tasks: completedTodos,
            completed_at: new Date().toISOString()
        })
        .eq("id", selectedTask.id)
        .select();

      if (error) throw error;
      toast.success("Pekerjaan berhasil dikirim untuk review!");
      setSelectedTask(null);
      fetchData();
    } catch (err) {
      toast.error("Terjadi kesalahan saat mengirim pekerjaan.");
    }
  };
  
  const handleLogout = () => {
    dispatch({ type: "LOGOUT" });
    toast.success("Anda berhasil logout.");
  };

  const getNormalizedTodoList = () => {
    if (!selectedTask || !selectedTask.todo_list || !Array.isArray(selectedTask.todo_list)) {
      return [];
    }
    return selectedTask.todo_list;
  };

  const todoListItems = getNormalizedTodoList();
  const allTodosCompleted = todoListItems.length > 0 && todoListItems.every(task => completedTodos.includes(task));
  
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Memuat tugas Anda...</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <div className="w-96 flex-shrink-0 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">Daftar Laporan Masuk</h2>
        </div>
        <div className="overflow-y-auto flex-grow">
          {assignedTasks.map(task => (
            <StaffTaskCard
              key={task.id}
              task={task}
              onSelect={() => handleSelectTask(task)}
              isSelected={selectedTask?.id === task.id}
            />
          ))}
          {assignedTasks.length === 0 && <p className="text-center text-gray-500 p-6">Tidak ada tugas aktif.</p>}
        </div>
        <div className="p-4 border-t">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {selectedTask ? (
          <div className="bg-white p-8 rounded-lg shadow-sm space-y-8 max-w-4xl mx-auto">
            {selectedTask.reports ? (
              <>
                <ReportHeaderInfo report={selectedTask.reports} profiles={profiles} />
                
                {loadingAttachments ? (
                  <p className="text-sm text-gray-500">Memuat lampiran...</p>
                ) : (
                  <FileViewer files={attachments} title="Dokumen dari TU" />
                )}

              </>
            ) : (
              <div className="p-4 bg-red-50 text-red-700 border rounded-lg">Data Laporan tidak ditemukan.</div>
            )}
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><ClipboardList className="text-green-500" /> Daftar Tugas</h3>
              <div className="space-y-3">
                {todoListItems.length > 0 ? (
                  todoListItems.map((taskName, index) => (
                    <label key={index} className="flex items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100">
                      <input type="checkbox" className="h-5 w-5" checked={completedTodos.includes(taskName)} onChange={() => handleToggleTodo(taskName)} />
                      <span className={`ml-3 text-sm ${completedTodos.includes(taskName) ? 'line-through text-gray-500' : ''}`}>{taskName}</span>
                    </label>
                  ))
                ) : (<p className="text-sm text-gray-500">Tidak ada daftar tugas.</p>)}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><MessageSquare className="text-yellow-500" /> Catatan Koordinator</h3>
              <p className="text-sm text-gray-700 p-4 bg-yellow-50 border rounded-lg whitespace-pre-wrap">{selectedTask.notes || "Tidak ada."}</p>
              {selectedTask.status === 'revision-required' && (
                <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-400">
                  <div className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-red-600" /><h4 className="font-medium text-red-800">Catatan Revisi</h4></div>
                  <p className="text-red-700 text-sm mt-2 whitespace-pre-wrap">{selectedTask.revision_notes || "Tidak ada detail."}</p>
                </div>
              )}
            </div>
            <div className="border-t pt-6 text-right">
              <button onClick={handleSubmitWork} disabled={!allTodosCompleted} className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700 disabled:bg-gray-400">
                <Send className="w-5 h-5" /> Selesai & Kirim
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-gray-500">
            <div>
              <FileText size={48} className="mx-auto text-gray-300" />
              <h3 className="mt-2 text-lg font-medium">Belum ada laporan yang dipilih</h3>
              <p className="mt-1 text-sm">Pilih laporan dari daftar di sebelah kiri.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}