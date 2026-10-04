"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Loader2 } from "lucide-react";

export default function DataCheckPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/data-check", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
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
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Database Data Check</h1>

          {/* Departments */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Departments ({data?.departments?.length || 0})</h2>
            <div className="space-y-2">
              {data?.departments?.map((dept: any) => (
                <div key={dept._id} className="p-3 bg-gray-50 rounded border">
                  <div className="font-medium">{dept.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Divisions */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Divisions ({data?.divisions?.length || 0})</h2>
            <div className="space-y-2">
              {data?.divisions?.map((div: any) => (
                <div key={div._id} className="p-3 bg-gray-50 rounded border">
                  <div className="font-medium">{div.name}</div>
                  <div className="text-xs text-gray-500">
                    Department: {div.departmentId ? <span className="text-green-600">Linked</span> : <span className="text-red-600 font-bold">NOT SET</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Users */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">
              Users (Approved: {data?.users?.length || 0})
            </h2>
            <div className="space-y-3">
              {data?.users && data.users.length > 0 ? (
                data.users.map((user: any) => (
                  <div key={user._id} className="p-4 bg-gray-50 rounded border">
                    <div className="font-medium text-lg">{user.name}</div>
                    <div className="text-sm text-gray-600">{user.email}</div>
                    <div className="mt-2 space-y-1 text-xs">
                      <div>
                        <span className="text-gray-500">Department:</span>{" "}
                        <span className={user.department ? "font-medium bg-yellow-100 px-1 rounded" : "text-red-600"}>
                          &quot;{user.department || "NOT SET"}&quot;
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Division:</span>{" "}
                        <span className={user.division ? "font-medium bg-yellow-100 px-1 rounded" : "text-red-600"}>
                          &quot;{user.division || "NOT SET"}&quot;
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-gray-500">isActive:</span>{" "}
                          <span className={user.isActive === false ? "text-red-600 font-bold" : "text-green-600"}>
                            {user.isActive === undefined ? "undefined" : String(user.isActive)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">isApproved:</span>{" "}
                          <span className={user.isApproved ? "text-green-600" : "text-red-600"}>
                            {String(user.isApproved)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No approved users found
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
