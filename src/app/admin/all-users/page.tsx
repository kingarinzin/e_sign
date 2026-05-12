"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Power,
  PowerOff,
  Search,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
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

// Helper: get initials from full name (or email fallback)
function getInitials(name: string | undefined, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  }
  return email.charAt(0).toUpperCase();
}

// Helper: generate a consistent pastel color based on name or email
function getAvatarColor(name: string | undefined, email: string): string {
  const colors = [
    "bg-red-100 text-red-700",
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-yellow-100 text-yellow-700",
    "bg-purple-100 text-purple-700",
    "bg-pink-100 text-pink-700",
    "bg-indigo-100 text-indigo-700",
    "bg-orange-100 text-orange-700",
    "bg-teal-100 text-teal-700",
    "bg-cyan-100 text-cyan-700",
  ];
  const str = name || email;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function AllUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Confirmation modal only for DELETE (dangerous action)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDangerous: false,
  });

  // Search and pagination state
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Show toast notification (auto-hide after 3 seconds)
  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Token validation & admin check
  useEffect(() => {
    const token = localStorage.getItem("token");
    const isAdmin = localStorage.getItem("isAdmin") === "true";

    if (!token) {
      router.push("/login");
      return;
    }

    if (!isAdmin) {
      showToast("Admin access required", "error");
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
        showToast("Admin access required", "error");
        setTimeout(() => router.push("/dashboard"), 2000);
        return;
      }

      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(user: User) {
    if (user.isAdmin) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          Admin
        </span>
      );
    }

    if (user.approvalStatus === "approved") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle size={12} /> Approved
        </span>
      );
    }

    if (user.approvalStatus === "pending") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Clock size={12} /> Pending
        </span>
      );
    }

    if (user.approvalStatus === "rejected") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <XCircle size={12} /> Rejected
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        Unknown
      </span>
    );
  }

  function getActivityBadge(user: User) {
    const isActive = user.isActive !== false;

    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <Power size={12} /> Active
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        <PowerOff size={12} /> Inactive
      </span>
    );
  }

  // Direct toggle status - NO confirmation modal
  async function handleToggleStatus(userId: string, newStatus: boolean) {
    setProcessingUserId(userId);

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
        showToast(data.error || "Failed to update user status", "error");
        return;
      }

      showToast(`User ${newStatus ? "activated" : "deactivated"} successfully`, "success");
      await fetchAllUsers();
    } catch (err) {
      console.error("Failed to toggle user status:", err);
      showToast("Failed to update user status", "error");
    } finally {
      setProcessingUserId(null);
    }
  }

  // For delete - show confirmation modal (destructive)
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
    setConfirmModal({
      isOpen: false,
      title: "",
      message: "",
      onConfirm: () => {},
      isDangerous: false,
    });
    setProcessingUserId(userId);

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
        showToast(data.error || "Failed to delete user", "error");
        return;
      }

      showToast("User deleted successfully", "success");
      await fetchAllUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
      showToast("Failed to delete user", "error");
    } finally {
      setProcessingUserId(null);
    }
  }

  // Filter users based on search
  const filteredUsers = users.filter((user) => {
    const searchLower = search.toLowerCase();
    return (
      (user.name?.toLowerCase() || "").includes(searchLower) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.department?.toLowerCase() || "").includes(searchLower) ||
      (user.division?.toLowerCase() || "").includes(searchLower) ||
      (user.designation?.toLowerCase() || "").includes(searchLower) ||
      (user.phoneNumber?.toLowerCase() || "").includes(searchLower)
    );
  });

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filteredUsers.length / rowsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-black" size={40} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50 relative">
      {/* Toast Notification (inline, non-modal) */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-lg transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <Sidebar />

      <main className="flex-1 p-4 md:p-6 lg:p-8 ml-0 lg:ml-64 w-full">
        <div className="w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage all registered users – view approval status, activate/deactivate, or delete
                accounts
              </p>
            </div>
            <div className="text-sm bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
              Total users:{" "}
              <span className="font-semibold text-black">{users.length}</span>
            </div>
          </div>

          {/* Search & Rows per page */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="relative w-full md:w-80">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search by name, email, department, division..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span>Show</span>
              <select
                value={rowsPerPage}
                onChange={(e) => setRowsPerPage(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-black"
              >
                {[10, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>entries</span>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full table-auto">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Division
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Approval Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Activity Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedUsers.length > 0 ? (
                    paginatedUsers.map((user) => {
                      const isActive = user.isActive !== false;
                      const isProcessing = processingUserId === user._id;

                      return (
                        <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${getAvatarColor(
                                  user.name,
                                  user.email
                                )}`}
                              >
                                {getInitials(user.name, user.email)}
                              </div>
                              <span className="text-sm font-medium text-gray-900">
                                {user.name || "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                            {user.email}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate">
                            {user.department || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate">
                            {user.division || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {getStatusBadge(user)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {getActivityBadge(user)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              {/* Toggle Status - direct action, no modal */}
                              <button
                                onClick={() =>
                                  handleToggleStatus(user._id, !isActive)
                                }
                                disabled={isProcessing}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  isActive
                                    ? "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                    : "bg-green-50 text-green-600 border border-green-200 hover:bg-green-100"
                                }`}
                              >
                                {isProcessing ? (
                                  <Loader2 className="animate-spin" size={12} />
                                ) : isActive ? (
                                  <PowerOff size={12} />
                                ) : (
                                  <Power size={12} />
                                )}
                                {isActive ? "Deactivate" : "Activate"}
                              </button>

                              {/* Delete - with confirmation modal */}
                              <button
                                onClick={() =>
                                  handleDeleteUser(user._id, user.email)
                                }
                                disabled={isProcessing}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-50 transition"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500">
                        No users found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-end items-center gap-4 mt-6 text-sm text-gray-700">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className={`px-3 py-1 rounded-lg border ${
                  currentPage === 1
                    ? "text-gray-300 border-gray-200 cursor-not-allowed"
                    : "hover:bg-gray-100 hover:border-gray-300"
                }`}
              >
                &lt; Prev
              </button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className={`px-3 py-1 rounded-lg border ${
                  currentPage === totalPages
                    ? "text-gray-300 border-gray-200 cursor-not-allowed"
                    : "hover:bg-gray-100 hover:border-gray-300"
                }`}
              >
                Next &gt;
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Confirmation Modal - ONLY for DELETE (destructive action) */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() =>
          setConfirmModal({
            isOpen: false,
            title: "",
            message: "",
            onConfirm: () => {},
            isDangerous: false,
          })
        }
        isDangerous={confirmModal.isDangerous}
      />
    </div>
  );
}