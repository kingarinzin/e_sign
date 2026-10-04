"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Key, User } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function SettingsPage() {
  const router = useRouter();
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  
  // Profile update state
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [division, setDivision] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const adminStatus = localStorage.getItem("isAdmin") === "true";
    setIsAdmin(adminStatus);
    
    // Only load profile/departments/divisions for non-admin users
    if (!adminStatus) {
      loadUserProfile();
      loadDepartmentsAndDivisions();
    } else {
      setLoadingProfile(false);
    }
  }, []);

  const loadUserProfile = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setName(data.name || "");
        setDepartment(data.department || "");
        setDivision(data.division || "");
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadDepartmentsAndDivisions = async () => {
    try {
      const token = localStorage.getItem("token");
      
      // Fetch departments
      const deptRes = await fetch("/api/admin/departments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(deptData.departments || []);
      }
      
      // Fetch divisions
      const divRes = await fetch("/api/admin/divisions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (divRes.ok) {
        const divData = await divRes.json();
        setDivisions(divData.divisions || []);
      }
    } catch (err) {
      console.error("Failed to load departments/divisions:", err);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");

    if (!name.trim()) {
      setProfileError("Name is required");
      return;
    }

    setProfileLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          name: name.trim(), 
          department: department || null,
          division: division || null
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setProfileMessage("Profile updated successfully!");
        // Trigger sidebar refresh by dispatching a storage event
        window.dispatchEvent(new Event('storage'));
      } else {
        setProfileError(data.error || "Failed to update profile");
      }
    } catch (err) {
      setProfileError("Server error");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }

    setPasswordLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        setPasswordMessage("Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setPasswordError(data.error || "Failed to change password");
      }
    } catch (err) {
      setPasswordError("Server error");
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loadingProfile) {
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
        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* Profile Settings Section - Only for non-admin users */}
          {!isAdmin && (
            <div className="bg-white rounded-lg shadow p-8">
              <div className="flex items-center gap-3 mb-6">
                <User className="text-indigo-600" size={28} />
                <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
              </div>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter your full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Department --</option>
                    {departments.map((dept) => (
                      <option key={dept._id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Division
                  </label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Select Division --</option>
                    {divisions.map((div) => (
                      <option key={div._id} value={div.name}>
                        {div.name}
                      </option>
                    ))}
                  </select>
                </div>

                {profileError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {profileError}
                  </div>
                )}

                {profileMessage && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    {profileMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={profileLoading}
                  className="cursor-pointer w-full bg-[#1a2b4a] text-white py-3 rounded-lg font-semibold hover:bg-[#2d446e] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {profileLoading && <Loader2 className="animate-spin" size={18} />}
                  Update Profile
                </button>
              </form>
            </div>
          )}

          {/* Password Change Section */}
          <div className="bg-white rounded-lg shadow p-8">
            <div className="flex items-center gap-3 mb-6">
              <Key className="text-indigo-600" size={28} />
              <h1 className="text-2xl font-bold text-gray-900">Change Password</h1>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {passwordError}
              </div>
            )}

            {passwordMessage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {passwordMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={passwordLoading}
              className="cursor-pointer w-full bg-[#1a2b4a] text-white py-3 rounded-lg font-semibold hover:bg-[#2d446e] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {passwordLoading && <Loader2 className="animate-spin" size={18} />}
              Change Password
            </button>
          </form>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Make sure to use a strong password with at least 6 characters.
            </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
