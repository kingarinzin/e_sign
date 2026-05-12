"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Edit, Save, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import SuccessModal from "@/components/SuccessModal";
import ConfirmModal from "@/components/ConfirmModal";

interface Department {
  _id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function DepartmentsPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
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

    fetchDepartments();
  }, [router]);

  async function fetchDepartments() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/departments", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("isAdmin");
        router.push("/login?expired=true");
        return;
      }

      const data = await res.json();
      setDepartments(data.departments || []);
    } catch (err) {
      console.error("Failed to fetch departments:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDepartment() {
    if (!newDepartmentName.trim()) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Department name cannot be empty"
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newDepartmentName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to create department"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "Department created successfully"
      });
      setNewDepartmentName("");
      fetchDepartments();
    } catch (err) {
      console.error("Failed to add department:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to create department"
      });
    }
  }

  function handleEditClick(dept: Department) {
    setEditingId(dept._id);
    setEditingName(dept.name);
  }

  async function handleSaveEdit(id: string) {
    if (!editingName.trim()) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Department name cannot be empty"
      });
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/departments/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editingName }),
      });

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to update department"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "Department updated successfully"
      });
      setEditingId(null);
      fetchDepartments();
    } catch (err) {
      console.error("Failed to update department:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to update department"
      });
    }
  }

  function handleDeleteClick(dept: Department) {
    setConfirmModal({
      isOpen: true,
      title: "Delete Department",
      message: `Are you sure you want to delete "${dept.name}"? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: () => executeDelete(dept._id),
    });
  }

  async function executeDelete(id: string) {
    setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false });

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/departments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to delete department"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "Department deleted successfully"
      });
      fetchDepartments();
    } catch (err) {
      console.error("Failed to delete department:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to delete department"
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
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Manage Departments</h1>
          
          {/* Add New Department */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Add New Department</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={newDepartmentName}
                onChange={(e) => setNewDepartmentName(e.target.value)}
                placeholder="Enter department name"
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00083d]"
                onKeyPress={(e) => e.key === "Enter" && handleAddDepartment()}
              />
              <button
                onClick={handleAddDepartment}
                className="bg-[#00083d] text-white px-6 py-3 rounded-lg hover:bg-[#000a4d] transition flex items-center gap-2 cursor-pointer"
              >
                <Plus size={20} />
                Add
              </button>
            </div>
          </div>

          {/* Departments List */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-4 font-semibold text-gray-700">Department Name</th>
                  <th className="text-left p-4 font-semibold text-gray-700">Created</th>
                  <th className="text-right p-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center p-8 text-gray-500">
                      No departments found. Add one above.
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => (
                    <tr key={dept._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="p-4">
                        {editingId === dept._id ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00083d] w-full"
                            autoFocus
                          />
                        ) : (
                          <span className="font-medium text-gray-800">{dept.name}</span>
                        )}
                      </td>
                      <td className="p-4 text-gray-600">
                        {new Date(dept.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          {editingId === dept._id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(dept._id)}
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
                                onClick={() => handleEditClick(dept)}
                                className="text-blue-600 hover:text-blue-700 p-2 cursor-pointer"
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(dept)}
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
      </div>

      <SuccessModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, title: "", message: "" })}
        title={modalState.title}
        message={modalState.message}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDangerous={confirmModal.isDangerous}
      />
    </div>
  );
}
