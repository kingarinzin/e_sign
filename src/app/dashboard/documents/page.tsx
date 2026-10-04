"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  Download,
  Edit3,
  FileText,
  PenSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface Meeting {
  _id: string;
  title: string;
  date: string;
  status: "Draft" | "Sent" | "Completed" | "Prepared";
  participants: {
    name: string;
    email: string;
    signed: boolean;
    isCurrent?: boolean;
  }[];
  sentAt?: string;
  currentSignerIndex?: number;
  createdAt?: string;
}

type FilterType =
  | "All"
  | "Drafts"
  | "Completed"
  | "I Need to Sign"
  | "My Signed Documents";

const SLUG_TO_FILTER: Record<string, FilterType> = {
  all: "All",
  drafts: "Drafts",
  completed: "Completed",
  "need-to-sign": "I Need to Sign",
  signed: "My Signed Documents",
};

const FILTER_TO_SLUG: Record<FilterType, string> = {
  All: "all",
  Drafts: "drafts",
  Completed: "completed",
  "I Need to Sign": "need-to-sign",
  "My Signed Documents": "signed",
};

const PAGE_SIZE = 10;

function DocumentListInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const getInitialFilter = (): FilterType => {
    const tab = searchParams.get("tab");
    if (tab && SLUG_TO_FILTER[tab]) return SLUG_TO_FILTER[tab];
    return "All";
  };

  const [activeFilter, setActiveFilter] = useState<FilterType>(
    getInitialFilter()
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && SLUG_TO_FILTER[tab]) {
      setActiveFilter(SLUG_TO_FILTER[tab]);
      setCurrentPage(1);
    }
  }, [searchParams]);

  async function fetchData() {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const meetingsRes = await fetch("/api/meetings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meetingsData = await meetingsRes.json();
      setMeetings(meetingsData.meetings || []);

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

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchData();
    };
    const handleFocus = () => fetchData();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener("click", handleClickOutside);
    }
    return () =>
      document.removeEventListener("click", handleClickOutside);
  }, [openDropdown]);

  // ─── Helpers ─────────────────────────────────────────────────
  const isAwaitingMySignature = (meeting: Meeting) => {
    if (!userEmail) return false;
    return meeting.participants.some(
      (p) =>
        p.email === userEmail &&
        !p.signed &&
        p.isCurrent === true &&
        meeting.status === "Sent"
    );
  };

  const iHaveSigned = (meeting: Meeting) => {
    if (!userEmail) return false;
    return meeting.participants.some(
      (p) => p.email === userEmail && p.signed === true
    );
  };

  const getSigningProgress = (meeting: Meeting) => {
    const signers = meeting.participants.filter(
      (p) => p.signed !== undefined
    );
    const signed = signers.filter((p) => p.signed).length;
    return { signed, total: signers.length };
  };

  // ─── Counts ──────────────────────────────────────────────────
  const allCount = meetings.length;
  const draftCount = meetings.filter((m) => m.status === "Draft").length;
  const needToSignCount = meetings.filter(isAwaitingMySignature).length;
  const completedCount = meetings.filter(
    (m) => m.status === "Completed"
  ).length;
  const mySignedCount = meetings.filter(
    (m) => iHaveSigned(m) && m.status !== "Completed"
  ).length;

  const getFilteredMeetings = () => {
    switch (activeFilter) {
      case "Drafts":
        return meetings.filter((m) => m.status === "Draft");
      case "Completed":
        return meetings.filter((m) => m.status === "Completed");
      case "I Need to Sign":
        return meetings.filter(isAwaitingMySignature);
      case "My Signed Documents":
        return meetings.filter(
          (m) => iHaveSigned(m) && m.status !== "Completed"
        );
      default:
        return meetings;
    }
  };

  const filteredMeetings = getFilteredMeetings();

  // ─── Pagination ──────────────────────────────────────────────
  const totalItems = filteredMeetings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const pageItems = filteredMeetings.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const filters: { type: FilterType; label: string; count: number }[] = [
    { type: "All", label: "All", count: allCount },
    { type: "Drafts", label: "Drafts", count: draftCount },
    {
      type: "I Need to Sign",
      label: "I Need to Sign",
      count: needToSignCount,
    },
    {
      type: "My Signed Documents",
      label: "My Signed Documents",
      count: mySignedCount,
    },
    { type: "Completed", label: "Completed", count: completedCount },
  ];

  const handleTabClick = (filter: FilterType) => {
    setActiveFilter(filter);
    setCurrentPage(1);
    const slug = FILTER_TO_SLUG[filter];
    router.replace(`/dashboard/documents?tab=${slug}`, { scroll: false });
  };

  const getStatusPill = (meeting: Meeting) => {
    const awaitingMine = isAwaitingMySignature(meeting);

    if (awaitingMine) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
          <AlertCircle size={10} /> Awaiting You
        </span>
      );
    }
    if (meeting.status === "Completed") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
          <CheckCircle2 size={10} /> Completed
        </span>
      );
    }
    if (meeting.status === "Sent") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
          <Clock size={10} /> In Progress
        </span>
      );
    }
    if (meeting.status === "Draft") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
          <Edit3 size={10} /> Draft
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full border border-gray-200">
        {meeting.status}
      </span>
    );
  };

  const getStatusAccent = (meeting: Meeting) => {
    if (isAwaitingMySignature(meeting)) return "border-l-red-500";
    if (meeting.status === "Completed") return "border-l-green-500";
    if (meeting.status === "Sent") return "border-l-blue-500";
    if (meeting.status === "Draft") return "border-l-amber-500";
    return "border-l-gray-300";
  };

  const handleDelete = async (
    meetingId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    if (deleteConfirm === meetingId) {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          setMeetings((prev) =>
            prev.filter((m) => m._id !== meetingId)
          );
          setDeleteConfirm(null);
        } else {
          alert("Failed to delete document");
        }
      } catch (err) {
        console.error("Delete error:", err);
        alert("Failed to delete document");
      }
    } else {
      setDeleteConfirm(meetingId);
    }
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(null);
  };

  const handleDownload = async (
    meetingId: string,
    title: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `/api/meetings/${meetingId}/download`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
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

  const handlePrimaryAction = (
    meeting: Meeting,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();

    if (meeting.status === "Draft") {
      router.push(`/dashboard/prepare/${meeting._id}`);
      return;
    }

    if (isAwaitingMySignature(meeting)) {
      router.push(`/sign/${meeting._id}`);
      return;
    }

    router.push(`/view/${meeting._id}`);
  };

  const toggleDropdown = (
    meetingId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setOpenDropdown(
      openDropdown === meetingId ? null : meetingId
    );
  };

  const goToPage = (page: number) => {
    const target = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const getPageNumbers = (): (number | "…")[] => {
    const pages: (number | "…")[] = [];
    const total = totalPages;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (safePage > 4) pages.push("…");

    const start = Math.max(2, safePage - 1);
    const end = Math.min(total - 1, safePage + 1);

    for (let i = start; i <= end; i++) pages.push(i);

    if (safePage < total - 3) pages.push("…");
    pages.push(total);

    return pages;
  };

  const formatRelative = (dateStr?: string): string => {
    if (!dateStr) return "—";
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const month = date
      .toLocaleString("en-US", { month: "short" })
      .toUpperCase();
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();
    return { month, day, year };
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-12 bg-white border border-gray-200 rounded animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 bg-white border border-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[#f8f9fc] pt-2 pb-0 -mt-2">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-xl font-semibold text-indigo-900">
            Document List
          </h1>
          <span className="text-xs text-gray-500">
            {totalItems} total
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {filters.map(({ type, label, count }) => {
            const isActive = activeFilter === type;
            return (
              <button
                key={type}
                onClick={() => handleTabClick(type)}
                className={`relative px-4 py-3 text-sm font-medium transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? "text-indigo-700"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {count}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>
          {totalItems === 0 ? (
            "No documents"
          ) : (
            <>
              Showing{" "}
              <span className="font-semibold text-gray-700">
                {startIndex + 1}–{Math.min(endIndex, totalItems)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-gray-700">
                {totalItems}
              </span>
            </>
          )}
        </span>
        {totalPages > 1 && (
          <span>
            Page {safePage} / {totalPages}
          </span>
        )}
      </div>

      {/* Document rows */}
      <div className="space-y-2">
        {pageItems.length > 0 ? (
          pageItems.map((meeting) => {
            const recipients = meeting.participants
              .map((p) => p.name || p.email)
              .join(", ");

            const statusDate = meeting.sentAt
              ? formatDate(meeting.sentAt)
              : null;
            const createdDate = meeting.createdAt
              ? formatDate(meeting.createdAt)
              : null;

            const awaitingMySignature =
              isAwaitingMySignature(meeting);
            const progress = getSigningProgress(meeting);

            return (
              <div
                key={meeting._id}
                onClick={(e) => handlePrimaryAction(meeting, e)}
                className={`group bg-white border border-gray-200 border-l-4 ${getStatusAccent(
                  meeting
                )} rounded-lg px-4 py-3 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer`}
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="shrink-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center transition">
                      <FileText
                        size={18}
                        className="text-gray-400 group-hover:text-indigo-600 transition"
                      />
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-700 transition">
                        {meeting.title}
                      </h3>
                      {getStatusPill(meeting)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="truncate max-w-md">
                        To: {recipients || "—"}
                      </span>
                      {meeting.status !== "Draft" && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span className="whitespace-nowrap">
                            {progress.signed}/{progress.total} signed
                          </span>
                        </>
                      )}
                      <span className="text-gray-300">•</span>
                      <span className="whitespace-nowrap">
                        {formatRelative(
                          meeting.sentAt || meeting.createdAt
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Right section */}
                  <div className="flex items-center gap-2 shrink-0">
                    {deleteConfirm === meeting._id ? (
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) =>
                            handleDelete(meeting._id, e)
                          }
                          className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={cancelDelete}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-md transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Primary action */}
                        {awaitingMySignature ? (
                          <button
                            onClick={(e) =>
                              handlePrimaryAction(meeting, e)
                            }
                            className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-md transition cursor-pointer"
                          >
                            <PenSquare size={13} />
                            Sign Now
                          </button>
                        ) : meeting.status === "Draft" ? (
                          <button
                            onClick={(e) =>
                              handlePrimaryAction(meeting, e)
                            }
                            className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-md transition cursor-pointer"
                          >
                            <Edit3 size={13} />
                            Continue
                          </button>
                        ) : (
                          <button
                            onClick={(e) =>
                              handlePrimaryAction(meeting, e)
                            }
                            className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-md transition cursor-pointer"
                          >
                            <Eye size={13} />
                            View
                          </button>
                        )}

                        {/* Dropdown */}
                        <div className="relative">
                          <button
                            onClick={(e) =>
                              toggleDropdown(meeting._id, e)
                            }
                            className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 p-2 rounded-md transition cursor-pointer"
                          >
                            <ChevronDown size={14} />
                          </button>

                          {openDropdown === meeting._id && (
                            <div
                              className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 shadow-lg rounded-md z-20 overflow-hidden"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {awaitingMySignature && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/sign/${meeting._id}`
                                    );
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <PenSquare size={14} />
                                  Sign Now
                                </button>
                              )}

                              {meeting.status === "Draft" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/dashboard/prepare/${meeting._id}`
                                    );
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <FileText size={14} />
                                  Prepare
                                </button>
                              )}

                              {meeting.status !== "Draft" && (
                                <button
                                  onClick={(e) =>
                                    handleDownload(
                                      meeting._id,
                                      meeting.title,
                                      e
                                    )
                                  }
                                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <Download size={14} />
                                  Download PDF
                                </button>
                              )}

                              {meeting.status !== "Completed" && (
                                <button
                                  onClick={(e) =>
                                    handleDelete(meeting._id, e)
                                  }
                                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer border-t border-gray-100"
                                >
                                  <Trash2 size={14} />
                                  Delete
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg p-16 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText size={22} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-1">
              No documents found
            </p>
            <p className="text-xs text-gray-500">
              Try a different filter or create a new document
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-4">
          <button
            onClick={() => goToPage(safePage - 1)}
            disabled={safePage === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft size={14} />
            Prev
          </button>

          {getPageNumbers().map((p, i) =>
            p === "…" ? (
              <span
                key={`ellipsis-${i}`}
                className="px-2 text-xs text-gray-400"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => goToPage(p as number)}
                className={`min-w-[32px] h-8 text-xs font-medium rounded-md transition cursor-pointer ${
                  safePage === p
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-700 hover:bg-gray-100 border border-gray-300"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => goToPage(safePage + 1)}
            disabled={safePage === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Default export with Suspense boundary ──────────────────────
export default function DocumentList() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-96">
          <Loader2
            className="animate-spin text-indigo-600"
            size={40}
          />
        </div>
      }
    >
      <DocumentListInner />
    </Suspense>
  );
}