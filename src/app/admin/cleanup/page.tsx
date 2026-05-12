"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Loader2, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function CleanupPage() {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [cleaning, setCleaning] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchCleanupInfo();
  }, []);

  const fetchCleanupInfo = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action: "get-cleanup-info" })
      });
      
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
      }
    } catch (err) {
      console.error("Failed to fetch cleanup info:", err);
    } finally {
      setLoading(false);
    }
  };

  const performCleanup = async (action: string, confirmMessage: string) => {
    if (!confirm(confirmMessage)) return;

    setCleaning(action);
    setMessage("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage(data.message);
        // Refresh info
        await fetchCleanupInfo();
      } else {
        setMessage("Failed to perform cleanup");
      }
    } catch (err) {
      console.error("Cleanup error:", err);
      setMessage("Error performing cleanup");
    } finally {
      setCleaning(null);
    }
  };

  if (loading) {
    return (
      <div className="flex">
        <Sidebar />
        <div className="flex-1 ml-64 min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 ml-64 min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Database Cleanup</h1>
            <p className="text-gray-600">Manage departments and divisions data</p>
          </div>

          {message && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
              <CheckCircle2 size={20} />
              {message}
            </div>
          )}

          {/* Current Counts */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium mb-1">Total Departments</p>
              <p className="text-3xl font-bold text-blue-900">{info?.totalDepartments || 0}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <p className="text-sm text-purple-600 font-medium mb-1">Total Divisions</p>
              <p className="text-3xl font-bold text-purple-900">{info?.totalDivisions || 0}</p>
            </div>
          </div>

          {/* Complete Wipe Section */}
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-600 flex-shrink-0 mt-1" size={28} />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-red-900 mb-2">
                  ⚠️ Complete Database Wipe
                </h2>
                <p className="text-sm text-red-700 mb-4">
                  These actions will permanently delete all data. Use this for a clean slate before creating new departments/divisions.
                </p>
                
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => performCleanup(
                      "delete-all-departments",
                      `⚠️ WARNING: This will delete ALL ${info?.totalDepartments || 0} departments permanently. This cannot be undone. Are you sure?`
                    )}
                    disabled={cleaning !== null || info?.totalDepartments === 0}
                    className="cursor-pointer bg-red-700 hover:bg-red-800 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cleaning === "delete-all-departments" ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Delete ALL Departments ({info?.totalDepartments || 0})
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => performCleanup(
                      "delete-all-divisions",
                      `⚠️ WARNING: This will delete ALL ${info?.totalDivisions || 0} divisions permanently. This cannot be undone. Are you sure?`
                    )}
                    disabled={cleaning !== null || info?.totalDivisions === 0}
                    className="cursor-pointer bg-red-700 hover:bg-red-800 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cleaning === "delete-all-divisions" ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        Delete ALL Divisions ({info?.totalDivisions || 0})
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Targeted Cleanup - Unlinked Divisions */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-1" size={24} />
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Unlinked Divisions
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  These divisions don&apos;t have a department assigned and won&apos;t appear in filtered dropdowns.
                </p>
                
                {info?.unlinkedDivisionsCount > 0 ? (
                  <>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                      <p className="text-sm font-medium text-yellow-900 mb-2">
                        Found {info.unlinkedDivisionsCount} unlinked division(s):
                      </p>
                      <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1 max-h-40 overflow-y-auto">
                        {info.unlinkedDivisions?.map((name: string, index: number) => (
                          <li key={index}>{name}</li>
                        ))}
                      </ul>
                    </div>
                    
                    <button
                      onClick={() => performCleanup(
                        "remove-unlinked-divisions",
                        `Are you sure you want to remove ${info.unlinkedDivisionsCount} unlinked division(s)? This cannot be undone.`
                      )}
                      disabled={cleaning !== null}
                      className="cursor-pointer bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {cleaning === "remove-unlinked-divisions" ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          Removing...
                        </>
                      ) : (
                        <>
                          <Trash2 size={16} />
                          Remove Unlinked Divisions
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    No unlinked divisions found. All divisions are properly linked.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
