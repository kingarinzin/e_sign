// app/dashboard/layout.tsx
"use client";

import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      {/* Main content area – pushed right by sidebar width */}
      <main className="ml-64 p-6">
        {children}
      </main>
    </div>
  );
}