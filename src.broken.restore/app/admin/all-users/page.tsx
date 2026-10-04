"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle, Clock, Trash2, Power, PowerOff } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import SuccessModal from "@/components/SuccessModal";
import ConfirmModal from "@/components/ConfirmModal";

interface User {
  _id: string;
  email: string;
  name?: string;
  department?: string;
  division?: string;
  designation?: string;
  phoneNumber?: string;
  isAdmin: boolean;
  isApproved: boolean;
  approvalStatus: string;
  isActive?: boolean;
  createdAt: string;
}

export default function AllUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
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

    async function checkTokenValidity() {
      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("isAdmin");
          router.push("/login?expired=true");
          return;
        }
      } catch (err) {
        console.error("Token validation error:", err);
      }
    }
    
    checkTokenValidity();
    fetchAllUsers();
  }, [router]);

  async function fetchAllUsers() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/all-users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("isAdmin");
        router.push("/login?expired=true");
        return;
      }

      if (res.status === 403) {
        setModalState({
          isOpen: true,
          title: "Unauthorized",
          message: "Admin access required"
        });
        setTimeout(() => router.push("/dashboard"), 2000);
        return;
      }

      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(user: User) {
    if (user.isAdmin) {
      return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">Admin</span>;
    }
    
    if (user.approvalStatus === 'approved') {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium inline-flex items-center gap-1"><CheckCircle size={12} />Approved</span>;
    }
    
    if (user.approvalStatus === 'pending') {
      return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium inline-flex items-center gap-1"><Clock size={12} />Pending</span>;
    }
    
    if (user.approvalStatus === 'rejected') {
      return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium inline-flex items-center gap-1"><XCircle size={12} />Rejected</span>;
    }
    
    return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">Unknown</span>;
  }

  function getActivityBadge(user: User) {
    // Default to active if isActive is undefined (for backward compatibility)
    const isActive = user.isActive !== false;
    
    if (isActive) {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium inline-flex items-center gap-1"><Power size={12} />Active</span>;
    }
    
    return <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs font-medium inline-flex items-center gap-1"><PowerOff size={12} />Inactive</span>;
  }

  function handleToggleStatus(userId: string, currentStatus: boolean) {
    const newStatus = !currentStatus;
    
    setConfirmModal({
      isOpen: true,
      title: `${newStatus ? 'Activate' : 'Deactivate'} User`,
      message: `Are you sure you want to ${newStatus ? 'activate' : 'deactivate'} this user?`,
      isDangerous: !newStatus,
      onConfirm: () => executeToggleStatus(userId, newStatus),
    });
  }

  async function executeToggleStatus(userId: string, newStatus: boolean) {
    setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false });

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/toggle-user-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, isActive: newStatus }),
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("isAdmin");
        router.push("/login?expired=true");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to update user status"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: `User ${newStatus ? 'activated' : 'deactivated'} successfully`
      });
      fetchAllUsers();
    } catch (err) {
      console.error("Failed to toggle user status:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to update user status"
      });
    }
  }

  function handleDeleteUser(userId: string, email: string) {
    setConfirmModal({
      isOpen: true,
      title: "Delete User",
      message: `Are you sure you want to permanently delete user "${email}"?\n\nThis action cannot be undone.`,
      isDangerous: true,
      onConfirm: () => executeDeleteUser(userId),
    });
  }

  async function executeDeleteUser(userId: string) {
    setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false });

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/delete-user?userId=${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("isAdmin");
        router.push("/login?expired=true");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Failed to delete user"
        });
        return;
      }

      setModalState({
        isOpen: true,
        title: "Success",
        message: "User deleted successfully"
      });
      fetchAllUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to delete user"
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 ml-64 min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">All Users</h1>
            <p className="text-gray-600 mt-2">View all registered users and their status</p>
          </div>

          {users.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No users found
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Division</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Approval Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activity Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => {
                    const isActive = user.isActive !== false;
                    return (
                      <tr key={user._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{user.department || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{user.division || '-'}</td>
                        <td className="px-6 py-4 text-sm">{getStatusBadge(user)}</td>
                        <td className="px-6 py-4 text-sm">{getActivityBadge(user)}</td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleToggleStatus(user._id, isActive)}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                                isActive 
                                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                              title={isActive ? 'Deactivate user' : 'Activate user'}
                            >
                              {isActive ? <PowerOff size={14} /> : <Power size={14} />}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user._id, user.email)}
                              className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 transition-colors cursor-pointer"
                              title="Delete user"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", onConfirm: () => {}, isDangerous: false })}
        isDangerous={confirmModal.isDangerous}
      />

      {/* Success/Error Modal */}
      <SuccessModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        onClose={() => setModalState({ isOpen: false, title: "", message: "" })}
      />
    </div>
  );
}
