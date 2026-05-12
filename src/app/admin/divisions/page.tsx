"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Edit, Save, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import SuccessModal from "@/components/SuccessModal";
import ConfirmModal from "@/components/ConfirmModal";

interface Division {
  _id: string;
  name: string;
  departmentId?: string;
  departmentName?: string;
  isActive: boolean;
  createdAt: string;
}

interface Department {
  _id: string;
  name: string;
  isActive: boolean;
}

function normalizeId(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.$oid === "string") return objectValue.$oid;
    if (typeof objectValue.toString === "function") return objectValue.toString();
  }

  return "";
}

export default function DivisionsPage() {
  const router = useRouter();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDivisionName, setNewDivisionName] = useState("");
  const [newDivisionDepartmentId, setNewDivisionDepartmentId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDepartmentId, setEditingDepartmentId] = useState("");
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous: boolean;
  }>({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false });

  useEffect(() => {
    const token = localStorage.getItem("token");
    const isAdmin = localStorage.getItem("isAdmin") === "true";
    
    if (!token) {
      router.push("/login");
      return;
    }

    if (!isAdmin) {
      setModalState({
        isOpen: true,
        title: "Unauthorized",
        message: "Admin access required"
      });
      setTimeout(() => router.push("/dashboard"), 2000);
      return;
    }

    fetchData();
  }, [router]);

  async function fetchData() {
    const departmentsData = await fetchDepartments();
    await fetchDivisions(departmentsData);
  }

  async function fetchDepartments(): Promise<Department[]> {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/departments", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const fetchedDepartments = data.departments || [];
        setDepartments(fetchedDepartments);
        return fetchedDepartments;
      }

      return [];
    } catch (err) {
      console.error("Failed to fetch departments:", err);
      return [];
    }
  }

  async function fetchDivisions(availableDepartments: Department[] = departments) {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/divisions", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("isAdmin");
        router.push("/login?expired=true");
        return;
      }

      const data = await res.json();
      const divisionsWithDepartments = data.divisions || [];
      
      // Enrich divisions with department names
      const enrichedDivisions = divisionsWithDepartments.map((div: Division) => {
        const divisionDepartmentId = normalizeId(div.departmentId);
        const dept = availableDepartments.find((d) => normalizeId(d._id) === divisionDepartmentId);
        return {
          ...div,
          departmentId: divisionDepartmentId,
          departmentName: dept?.name || "No Department"
        };
      });
      
      setDivisions(enrichedDivisions);
    } catch (err) {
      console.error("Failed to fetch divisions:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDivision() {
    if (!newDivisionName.trim()) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Division name cannot be empty"
      });
      return;
    }

    if (!newDivisionDepartmentId) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Please select a department"
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/divisions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          name: newDivisionName,
          departmentId: newDivisionDepartmentId 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to create division"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "Division created successfully"
      });
      setNewDivisionName("");
      setNewDivisionDepartmentId("");
      fetchDivisions();
    } catch (err) {
      console.error("Failed to add division:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to create division"
      });
    }
  }

  function handleEditClick(div: Division) {
    setEditingId(div._id);
    setEditingName(div.name);
    setEditingDepartmentId(div.departmentId || "");
  }

  async function handleSaveEdit(id: string) {
    if (!editingName.trim()) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Division name cannot be empty"
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/divisions/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          name: editingName,
          departmentId: editingDepartmentId 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to update division"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "Division updated successfully"
      });
      setEditingId(null);
      fetchDivisions();
    } catch (err) {
      console.error("Failed to update division:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to update division"
      });
    }
  }

  function handleDeleteClick(div: Division) {
    setConfirmModal({
      isOpen: true,
      title: "Delete Division",
      message: `Are you sure you want to delete "${div.name}"? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: () => executeDelete(div._id),
    });
  }

  async function executeDelete(id: string) {
    setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false });

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/divisions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to delete division"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "Division deleted successfully"
      });
      fetchDivisions();
    } catch (err) {
      console.error("Failed to delete division:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to delete division"
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-[#00083d]" size={32} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-8 ml-64">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Manage Divisions</h1>
          
          {/* Add New Division */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Add New Division</h2>
            <div className="flex flex-col gap-3">
              <select
                value={newDivisionDepartmentId}
                onChange={(e) => setNewDivisionDepartmentId(e.target.value)}
                className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00083d] bg-white"
              >
                <option value="">Select Department *</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newDivisionName}
                  onChange={(e) => setNewDivisionName(e.target.value)}
                  placeholder="Enter division name"
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00083d]"
                  onKeyPress={(e) => e.key === "Enter" && handleAddDivision()}
                />
                <button
                  onClick={handleAddDivision}
                  className="bg-[#00083d] text-white px-6 py-3 rounded-lg hover:bg-[#000a4d] transition flex items-center gap-2 cursor-pointer"
                >
                  <Plus size={20} />
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Divisions List */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-4 font-semibold text-gray-700">Division Name</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Department</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Created</th>
                  <th className="text-right p-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {divisions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-8 text-gray-500">
                      No divisions found. Add one above.
                    </td>
                  </tr>
                ) : (
                  divisions.map((div) => (
                    <tr key={div._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4">
                        {editingId === div._id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00083d] w-full"
                            autoFocus
                          />
                        ) : (
                          <span className="font-medium text-gray-800">{div.name}</span>
                        )}
                      </td>
                      <td className="p-4">
                        {editingId === div._id ? (
                          <select
                            value={editingDepartmentId}
                            onChange={(e) => setEditingDepartmentId(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00083d] w-full bg-white"
                          >
                            <option value="">Select Department</option>
                            {departments.map((dept) => (
                              <option key={dept._id} value={dept._id}>
                                {dept.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-600">{div.departmentName}</span>
                        )}
                      </td>
                      <td className="p-4 text-gray-600">
                        {new Date(div.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          {editingId === div._id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(div._id)}
                                className="text-green-600 hover:text-green-700 p-2 cursor-pointer"
                                title="Save"
                              >
                                <Save size={18} />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-gray-600 hover:text-gray-700 p-2 cursor-pointer"
                                title="Cancel"
                              >
                                <X size={18} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEditClick(div)}
                                className="text-blue-600 hover:text-blue-700 p-2 cursor-pointer"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(div)}
                                className="text-red-600 hover:text-red-700 p-2 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Success Modal */}
        <SuccessModal
          isOpen={modalState.isOpen && modalState.title === "Success"}
          title={modalState.title}
          message={modalState.message}
          onClose={() => setModalState({ isOpen: false, title: "", message: "" })}
        />

        {/* Error Modal */}
        {modalState.isOpen && modalState.title !== "Success" && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold text-gray-800 mb-2">{modalState.title}</h3>
              <p className="text-gray-600 mb-4">{modalState.message}</p>
              <button
                onClick={() => setModalState({ isOpen: false, title: "", message: "" })}
                className="w-full bg-[#00083d] text-white px-4 py-2 rounded-lg hover:bg-[#000a4d] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Confirm Modal */}
        <ConfirmModal
          isOpen={confirmModal.isOpen}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false })}
          isDangerous={confirmModal.isDangerous}
        />
      </div>
    </div>
  );
}
