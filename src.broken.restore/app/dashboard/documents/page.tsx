"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronDown, Trash2, Eye, Download, Edit, FileText } from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface Meeting {
  _id: string;
  title: string;
  date: string;
  status: "Draft" | "Sent" | "Completed" | "Prepared";
  participants: { name: string; email: string; signed: boolean; isCurrent?: boolean }[];
  sentAt?: string;
  currentSignerIndex?: number;
  createdAt?: string;
}

type FilterType = "All" | "Drafts" | "Completed" | "I Need to Sign" | "My Signed Documents";

export default function DocumentList() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>("All");
  const [userEmail, setUserEmail] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Check authentication and token validity
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
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
        }
      } catch (err) {
        console.error("Token validation error:", err);
      }
    }
    
    checkTokenValidity();
  }, [router]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDropdown]);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem("token");
        
        // Fetch meetings
        const meetingsRes = await fetch("/api/meetings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meetingsData = await meetingsRes.json();
        setMeetings(meetingsData.meetings || []);

        // Fetch user profile to get email
        const profileRes = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setUserEmail(profileData.email || "");
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const getFilteredMeetings = () => {
    switch (activeFilter) {
      case "Drafts":
        return meetings.filter(m => m.status === "Draft");
      case "Completed":
        return meetings.filter(m => m.status === "Completed");
      case "I Need to Sign":
        return meetings.filter(m => 
          m.status === "Sent" && 
          m.participants.some(p => p.email === userEmail && !p.signed && p.isCurrent === true)
        );
      case "My Signed Documents":
        return meetings.filter(m => 
          m.status === "Completed" &&
          m.participants.some(p => p.email === userEmail && p.signed === true)
        );
      default:
        return meetings;
    }
  };

  const filteredMeetings = getFilteredMeetings();

  const filters: FilterType[] = ["All", "Drafts", "I Need to Sign", "My Signed Documents", "Completed"];

  const getStatusBadge = (status: string) => {
    const colors = {
      Draft: 'bg-amber-600',
      Prepared: 'bg-indigo-600',
      Sent: 'bg-blue-600',
      Completed: 'bg-green-700'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-600';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return { month, day, year };
  };

  const handleDelete = async (meetingId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    
    if (deleteConfirm === meetingId) {
      // Perform actual delete
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          // Remove from state
          setMeetings(prev => prev.filter(m => m._id !== meetingId));
          setDeleteConfirm(null);
        } else {
          alert("Failed to delete document");
        }
      } catch (err) {
        console.error("Delete error:", err);
        alert("Failed to delete document");
      }
    } else {
      // Show confirmation
      setDeleteConfirm(meetingId);
    }
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(null);
  };

  const handleDownload = async (meetingId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/meetings/${meetingId}/download`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert("Failed to download PDF");
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download PDF");
    }
    setOpenDropdown(null);
  };

  const handleView = (meetingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/view/${meetingId}`);
  };

  const handleEdit = (meetingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/dashboard/meetings/${meetingId}/edit`);
  };

  const handlePrimaryAction = (meeting: Meeting, e: React.MouseEvent) => {
    e.stopPropagation();
    if (meeting.status === 'Draft') {
      router.push(`/dashboard/meetings/${meeting._id}/edit`);
    } else {
      router.push(`/view/${meeting._id}`);
    }
  };

  const toggleDropdown = (meetingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenDropdown(openDropdown === meetingId ? null : meetingId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#2d3748] flex">
      <div className="w-64 shrink-0"></div>
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Navigation Bar */}
        <header className="bg-white shadow-md px-8 py-7.5 flex justify-between items-center sticky top-0 z-20 -ml-64 pl-72">
          <h1 className="text-xl font-semibold text-indigo-900">Document List</h1>
        </header>

        <main className="flex-1 w-full mx-auto px-8 py-6">
          {/* Filter Tabs */}
          <div className="flex gap-3 mb-6 border-b pb-0">
            {filters.map((filter) => {
              // Get tooltip text for each filter
              const getTooltip = (filterName: FilterType) => {
                switch (filterName) {
                  case "All":
                    return "All documents you created or participated in";
                  case "Drafts":
                    return "Documents you created but haven't sent yet";
                  case "I Need to Sign":
                    return "Documents waiting for your signature";
                  case "My Signed Documents":
                    return "Completed documents where you were a signer";
                  case "Completed":
                    return "Fully signed documents you organized";
                  default:
                    return "";
                }
              };

              return (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  title={getTooltip(filter)}
                  className={`px-6 py-3 text-sm font-medium transition relative cursor-pointer ${
                    activeFilter === filter
                      ? 'text-blue-500 border-b-2 border-blue-500'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {filter}
                </button>
              );
            })}
          </div>

          {/* Documents List */}
          <div className="space-y-3">
            {filteredMeetings.length > 0 ? (
              filteredMeetings.map((meeting) => {
                const recipients = meeting.participants
                  .map(p => p.name || p.email)
                  .join(", ");
                
                const createdDate = meeting.createdAt ? formatDate(meeting.createdAt) : null;
                const statusDate = meeting.sentAt ? formatDate(meeting.sentAt) : null;
                
                return (
                  <div 
                    key={meeting._id} 
                    className="bg-white border border-gray-300 rounded p-4 hover:shadow-sm transition"
                  >
                    <div className="flex items-start justify-between">
                      {/* Left section with dates and content */}
                      <div className="flex gap-4 flex-1">
                        {/* Date Badges */}
                        <div className="flex gap-2">
                          {statusDate && (
                            <div className="flex flex-col items-center">
                              <div className={`${getStatusBadge(meeting.status)} text-white text-[10px] font-bold px-2 py-0.5 uppercase`}>
                                {meeting.status}
                              </div>
                              <div className="text-xs font-semibold text-gray-700 mt-1">
                                {statusDate.month} {statusDate.day} {statusDate.year}
                              </div>
                            </div>
                          )}
                          {createdDate && (
                            <div className="flex flex-col items-center">
                              <div className="bg-gray-300 text-gray-700 text-[10px] font-bold px-2 py-0.5 uppercase">
                                {statusDate ? 'Created' : meeting.status}
                              </div>
                              <div className="text-xs font-semibold text-gray-700 mt-1">
                                {createdDate.month} {createdDate.day} {createdDate.year}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Document Info */}
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-gray-900 mb-1">
                            {meeting.title}
                          </h3>
                          <p className="text-xs text-gray-500">
                            To: <span className="text-gray-700">{recipients || "—"}</span>
                          </p>
                        </div>
                      </div>

                      {/* Right section with action buttons */}
                      <div className="flex items-center gap-2">
                        {/* Action Buttons */}
                        <div className="relative flex items-center gap-0">
                          {deleteConfirm === meeting._id ? (
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => handleDelete(meeting._id, e)}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 transition cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={cancelDelete}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-700 text-xs font-medium px-3 py-1.5 transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* Primary Action Button */}
                              <button
                                onClick={(e) => handlePrimaryAction(meeting, e)}
                                className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-3 py-2 border border-gray-300 transition cursor-pointer w-20"
                              >
                                {meeting.status === 'Draft' ? (
                                  <>
                                    <Edit size={14} />
                                    Edit
                                  </>
                                ) : (
                                  <>
                                    <Eye size={14} />
                                    View
                                  </>
                                )}
                              </button>

                              {/* Dropdown Toggle Button */}
                              <button
                                onClick={(e) => toggleDropdown(meeting._id, e)}
                                className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-2 border border-l-0 border-gray-300 transition cursor-pointer h-9.5"
                              >
                                <ChevronDown size={14} />
                              </button>

                              {/* Dropdown Menu */}
                              {openDropdown === meeting._id && (
                                <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-300 shadow-md z-10" style={{ top: '100%' }}>
                                  {meeting.status === 'Draft' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/dashboard/prepare/${meeting._id}`);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                    >
                                      <FileText size={14} />
                                      Prepare
                                    </button>
                                  )}
                                  {meeting.status !== 'Draft' && (
                                    <button
                                      onClick={(e) => handleDownload(meeting._id, meeting.title, e)}
                                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                    >
                                      <Download size={14} />
                                      Download PDF
                                    </button>
                                  )}
                                  {meeting.status !== 'Completed' && (
                                    <button
                                      onClick={(e) => handleDelete(meeting._id, e)}
                                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer rounded-b"
                                    >
                                      <Trash2 size={14} />
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-16 text-center">
                <p className="text-sm text-gray-400 italic">
                  No documents found for this filter
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
