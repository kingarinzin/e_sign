"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import SuccessModal from "@/components/SuccessModal";

interface PendingUser {
  _id: string;
  email: string;
  name?: string;
  department?: string;
  division?: string;
  designation?: string;
  phoneNumber?: string;
  cidNumber?: string;
  createdAt: string;
  approvalStatus: string;
}

export default function PendingUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });

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
    fetchPendingUsers();
  }, [router]);

  async function fetchPendingUsers() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/pending-users", {
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
      console.error("Failed to fetch pending users:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(userId: string, action: 'approve' | 'reject') {
    setActionLoading(userId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/approve-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, action }),
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("isAdmin");
        router.push("/login?expired=true");
        return;
      }

      if (res.ok) {
        setModalState({
          isOpen: true,
          title: "Success",
          message: `User ${action === 'approve' ? 'approved' : 'rejected'} successfully`
        });
        fetchPendingUsers();
      } else {
        const data = await res.json();
        setModalState({
          isOpen: true,
          title: "Error",
          message: data.error || "Action failed"
        });
      }
    } catch (err) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to process request"
      });
    } finally {
      setActionLoading(null);
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
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Pending User Approvals</h1>
            <p className="text-gray-600 mt-2">Review and approve new user registrations</p>
          </div>

          {users.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No pending users
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user._id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.department || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{user.division || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handleAction(user._id, 'approve')}
                        disabled={actionLoading === user._id}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                      >
                        {actionLoading === user._id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <CheckCircle size={14} />
                        )}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(user._id, 'reject')}
                        disabled={actionLoading === user._id}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

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
