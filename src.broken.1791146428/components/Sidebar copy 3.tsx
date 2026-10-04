"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  LogOut,
  Shield,
  Settings,
  Users,
  Loader2,
  Building,
  MapPin,
  Database,
  Eraser,
} from "lucide-react";
import { useEffect, useState } from "react";

// Helper to extract email from JWT token
const getEmailFromToken = (token: string): string => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return "";
    const decoded = JSON.parse(atob(payload));
    return typeof decoded?.email === "string" ? decoded.email : "";
  } catch {
    return "";
  }
};

// Avatar helpers (identical to AllUsersPage)
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

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userDivision, setUserDivision] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    const adminStatus = localStorage.getItem("isAdmin") === "true";
    setIsAdmin(adminStatus);

    async function loadProfile() {
      const token = localStorage.getItem("token");
      if (!token) return;

      const tokenEmail = getEmailFromToken(token);
      if (tokenEmail) setUserEmail(tokenEmail);

      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUserName(data.name || "");
          setUserEmail(data.email || tokenEmail || "");
          setUserDepartment(data.department || "");
          setUserDivision(data.division || "");
        }
      } catch (err) {
        console.error("Profile load error:", err);
      }
    }

    loadProfile();

    const handleStorageChange = () => loadProfile();
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleLogout = () => {
    setLoggingOut(true);
    setTimeout(() => {
      localStorage.clear();
      router.push("/login");
    }, 500);
  };

  const isActive = (path: string) => pathname === path;

  const navButtonClass = (active: boolean) =>
    `w-full flex items-center gap-3 px-4 py-3 rounded-md transition ${
      active ? "bg-black text-white" : "text-black hover:bg-gray-100"
    }`;

  const userNavItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { name: "Document List", icon: FileText, path: "/dashboard/documents" },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

  const adminNavItems = [
    { name: "Pending Approvals", icon: Shield, path: "/admin/pending-users" },
    { name: "All Users", icon: Users, path: "/admin/all-users" },
    { name: "Departments", icon: Building, path: "/admin/departments" },
    { name: "Divisions", icon: MapPin, path: "/admin/divisions" },
    { name: "Data Check", icon: Database, path: "/admin/data-check" },
    { name: "Cleanup", icon: Eraser, path: "/admin/cleanup" },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

  const displayName = userName || userEmail || "User";
  const avatarInitials = getInitials(userName, userEmail);
  const avatarColorClass = getAvatarColor(userName, userEmail);

  return (
    <aside className="w-64 bg-white h-screen fixed top-0 left-0 flex flex-col text-sm shadow-lg z-20">
      {/* Logo – always above avatar, with fallback */}
      <div className="p-6 flex justify-center border-b border-gray-100">
        {!logoError ? (
          <img
            src="/logo.png"
            alt="e-Sign Logo"
            className="h-12 w-auto object-contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 bg-black rounded-full flex items-center justify-center">
              <span className="text-white text-xl font-bold">E</span>
            </div>
            <span className="text-xs font-semibold text-gray-700 mt-1">e-Sign</span>
          </div>
        )}
      </div>

      {/* User avatar + info */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-100">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${avatarColorClass}`}
        >
          {avatarInitials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
          {userDepartment && (
            <p className="text-xs text-gray-500 truncate">{userDepartment}</p>
          )}
          {userDivision && (
            <p className="text-xs text-gray-400 truncate">{userDivision}</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-3 space-y-2 overflow-y-auto min-h-0">
        {(isAdmin ? adminNavItems : userNavItems).map((item) => (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            className={navButtonClass(isActive(item.path))}
          >
            <item.icon size={18} />
            {item.name}
          </button>
        ))}
      </nav>

      {/* Logout Button */}
      <div className="px-4 py-4">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-black hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loggingOut ? (
            <>
              <Loader2 size={18} className="animate-spin text-red-500" />
              <span className="text-red-500">Logging out...</span>
            </>
          ) : (
            <>
              <LogOut size={18} className="text-red-500" />
              <span className="text-red-500">Logout</span>
            </>
          )}
        </button>
      </div>

      {/* Copyright Footer */}
      <div className="px-4 py-4 border-t border-gray-100 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} ANTI-CORRUPTION COMMISSION
      </div>
    </aside>
  );
}