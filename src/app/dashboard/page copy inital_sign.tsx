"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Upload,
  AlertCircle,
  Clock,
  CheckCircle2,
  Edit3,
  Loader2,
  X,
  Send,
  User,
} from "lucide-react";

const Document = dynamic(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false }
);

const Page = dynamic(
  () => import("react-pdf").then((m) => m.Page),
  { ssr: false }
);

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
  description?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [signatureImg, setSignatureImg] = useState<string | null>(null);
  const [initialsImg, setInitialsImg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [previewMeeting, setPreviewMeeting] = useState<Meeting | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pageWidth, setPageWidth] = useState(500);

  const sigInputRef = useRef<HTMLInputElement>(null);
  const initialsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    import("react-pdf").then(({ pdfjs }) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    });
  }, []);

  useEffect(() => {
    const updatePageWidth = () => {
      setPageWidth(Math.min(window.innerWidth * 0.5, 500));
    };
    updatePageWidth();
    window.addEventListener("resize", updatePageWidth);
    return () => window.removeEventListener("resize", updatePageWidth);
  }, []);

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
        } else if (res.ok) {
          const data = await res.json();
          setUserName(data.name || data.email || "User");
          setSignatureImg(data.signature || null);
          setInitialsImg(data.initials || null);
          if (data.signature) localStorage.setItem("userSignature", data.signature);
        }
      } catch (err) {
        console.error("Token validation error:", err);
      }
    }
    checkTokenValidity();
  }, [router]);

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/meetings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setMeetings(data.meetings || []);
        setUserEmail(data.userEmail || null);
      } catch (err) {
        console.error("Failed to fetch meetings:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMeetings();
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchMeetings();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const getSigningProgress = (meeting: Meeting) => {
    const signers = meeting.participants.filter((p) => p.signed !== undefined);
    const signed = signers.filter((p) => p.signed).length;
    return { signed, total: signers.length };
  };

  const drafts = meetings.filter((m) => m.status === "Draft");
  const needToSign = meetings.filter((m) => {
    if (!userEmail) return false;
    const myParticipant = m.participants.find((p) => p.email === userEmail);
    return myParticipant && !myParticipant.signed && myParticipant.isCurrent;
  });
  const waitingForOthersCount = meetings.filter(
    (m) => m.status === "Sent" && m.participants.some((p) => !p.signed) &&
    !needToSign.some(need => need._id === m._id)
  ).length;
  const completedCount = meetings.filter((m) => m.status === "Completed").length;
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const sentThisMonth = meetings.filter(m => 
    m.status === "Sent" && m.sentAt && 
    new Date(m.sentAt).getMonth() === currentMonth &&
    new Date(m.sentAt).getFullYear() === currentYear
  ).length;
  const totalSent = meetings.filter(m => m.status === "Sent").length;

  const recentDocuments = [...meetings]
    .filter(m => m.status !== "Draft")
    .sort((a, b) => {
      const dateA = a.sentAt || a.createdAt || "";
      const dateB = b.sentAt || b.createdAt || "";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .slice(0, 5);

  const getDraftedBy = (meeting: Meeting) => {
    if (meeting.participants && meeting.participants.length > 0) {
      return meeting.participants[0].email;
    }
    return "unknown@acc.org.bd";
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "signature" | "initials"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      if (type === "signature") setSignatureImg(base64String);
      else setInitialsImg(base64String);
      try {
        setIsUploading(true);
        const token = localStorage.getItem("token");
        await fetch("/api/user/update-signature", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ [type]: base64String }),
        });
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePreviewDocument = async (meeting: Meeting) => {
    setPreviewMeeting(meeting);
    setPreviewLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/meetings/${meeting._id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPreviewPdfUrl(url);
      }
    } catch (err) {
      console.error("Failed to load PDF preview:", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewMeeting(null);
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#f8f9fc] pb-4 -mt-2 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={() => router.push("/dashboard/new-meeting")}
            className="bg-[#1a2b4a] cursor-pointer text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 hover:bg-[#2a3b5a] transition w-fit"
          >
            New Document +
          </button>
        </div>
      </div>

      {/* Need to sign alert */}
      {needToSign.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-red-500 p-2 rounded-full text-white shrink-0 mt-0.5">
                <AlertCircle size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-red-900 mb-1">
                  {needToSign.length} Document{needToSign.length > 1 ? "s" : ""} Awaiting Your Signature
                </h3>
                <p className="text-xs text-red-800 mb-3">
                  You have pending documents that require your signature
                </p>
                <div className="space-y-2">
                  {needToSign.map((meeting) => (
                    <div
                      key={meeting._id}
                      onClick={() => handlePreviewDocument(meeting)}
                      className="flex items-center justify-between bg-white rounded-lg p-3 hover:bg-red-50 cursor-pointer transition-all group border border-gray-200 hover:border-red-300"
                    >
                      <div className="flex items-center gap-3">
                        <Edit3 size={14} className="text-red-500" />
                        <div>
                          <span className="text-sm font-medium text-gray-800 group-hover:text-red-900">
                            {meeting.title}
                          </span>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {meeting.sentAt
                              ? `Sent ${new Date(meeting.sentAt).toLocaleDateString()}`
                              : "Pending signature"}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/sign/${meeting._id}`);
                        }}
                        className="bg-red-500 text-white text-xs px-4 py-2 rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        Sign Now →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Documents Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">Documents</h3>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500 p-1.5 rounded text-white"><AlertCircle size={16} /></div>
                  <span className="text-sm font-medium text-gray-800">Waiting my signature</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{needToSign.length}</span>
                  <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Show all →</button>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-500 p-1.5 rounded text-white"><Clock size={16} /></div>
                  <span className="text-sm font-medium text-gray-800">Waiting for others</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{waitingForOthersCount}</span>
                  <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Show all →</button>
                </div>
              </div>
              <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                <div className="flex items-center gap-3">
                  <div className="bg-green-600 p-1.5 rounded text-white"><CheckCircle2 size={16} /></div>
                  <span className="text-sm font-medium text-gray-800">Completed</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900">{completedCount}</span>
                  <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Show all →</button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-800">Recent Activity</h3>
              <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Show all →</button>
            </div>
            <div className="divide-y divide-gray-100">
              {recentDocuments.length > 0 ? (
                recentDocuments.map((meeting) => {
                  const progress = getSigningProgress(meeting);
                  return (
                    <div
                      key={meeting._id}
                      onClick={() => handlePreviewDocument(meeting)}
                      className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition group"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="text-xs text-gray-500">
                              {new Date(meeting.sentAt || meeting.createdAt || "").toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </span>
                            <span className="font-medium text-gray-800 group-hover:text-indigo-700">
                              {meeting.title}
                            </span>
                            <span className="text-xs text-gray-500">
                              drafted by {getDraftedBy(meeting)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            {meeting.status === "Completed" && (
                              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Completed</span>
                            )}
                            {meeting.status === "Sent" && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                                {progress.signed}/{progress.total} signed
                              </span>
                            )}
                          </div>
                        </div>
                        <button className="text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity ml-2">View →</button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-5 py-8 text-center text-gray-400 text-xs">No documents to display</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><User size={16} /> My Signature</h3>
            </div>
            <div className="p-5">
              <div className="text-center mb-4">
                <div className="text-base font-semibold text-gray-900">{userName}</div>
                <div className="text-xs text-gray-500 mt-1">{userEmail}</div>
              </div>
              <div onClick={() => sigInputRef.current?.click()} className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 cursor-pointer hover:bg-gray-100 transition group">
                <input type="file" ref={sigInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, "signature")} />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">Signature</span>
                  <button className="text-xs text-indigo-600 group-hover:underline">Edit</button>
                </div>
                <div className="flex justify-center mt-2 min-h-[50px]">
                  {signatureImg ? <img src={signatureImg} alt="Signature" className="max-h-12 object-contain" /> : <div className="flex flex-col items-center text-gray-400"><Upload size={20} /><span className="text-[10px] mt-1">Click to upload</span></div>}
                </div>
              </div>
              <div onClick={() => initialsInputRef.current?.click()} className="bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-100 transition group">
                <input type="file" ref={initialsInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, "initials")} />
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">Initials</span>
                  <button className="text-xs text-indigo-600 group-hover:underline">Edit</button>
                </div>
                <div className="flex justify-center mt-2 min-h-[40px]">
                  {initialsImg ? <img src={initialsImg} alt="Initials" className="max-h-10 object-contain" /> : <div className="flex flex-col items-center text-gray-400"><Upload size={16} /><span className="text-[10px] mt-1">Click to upload</span></div>}
                </div>
              </div>
              {isUploading && <div className="text-xs text-gray-500 flex items-center justify-center gap-2 mt-3"><Loader2 className="animate-spin" size={14} /> Uploading...</div>}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Send size={16} /> Documents Sent This Month</h3>
            </div>
            <div className="p-5">
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-600">{sentThisMonth}</div>
                <div className="text-xs text-gray-500 mt-1">sent this month</div>
                <div className="mt-3 pt-3 border-t border-gray-100"><div className="text-sm text-gray-700">Total sent: <span className="font-semibold">{totalSent}</span></div></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-800">Recent Drafts</h3>
              {drafts.length > 0 && <button onClick={() => router.push("/dashboard/drafts")} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View All Drafts →</button>}
            </div>
            <div className="divide-y divide-gray-100">
              {drafts.length > 0 ? drafts.slice(0, 4).map((draft) => (
                <div key={draft._id} onClick={() => router.push(`/dashboard/meetings/${draft._id}/edit`)} className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition group">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2"><Edit3 size={12} className="text-gray-400 group-hover:text-indigo-600" /><span className="text-sm font-medium text-gray-800 group-hover:text-indigo-700">{draft.title}</span></div>
                    <span className="text-[10px] text-gray-400">{draft.createdAt ? new Date(draft.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ""}</span>
                  </div>
                </div>
              )) : <div className="px-5 py-8 text-center text-gray-400 text-xs">No drafts to show</div>}
            </div>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewMeeting && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
              <div className="flex-1 pr-4">
                <h3 className="text-base font-semibold text-gray-900">{previewMeeting.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{previewMeeting.sentAt ? `Sent ${new Date(previewMeeting.sentAt).toLocaleDateString()}` : "Pending signature"}</p>
              </div>
              <button onClick={closePreview} className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"><X size={18} className="text-gray-600" /></button>
            </div>
            {previewMeeting.description && (
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-medium text-blue-900 mb-1">Message from sender</p>
                <p className="text-xs text-blue-800 leading-relaxed">{previewMeeting.description}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto bg-gray-100 flex items-center justify-center p-4">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2"><Loader2 className="animate-spin text-indigo-600" size={32} /><p className="text-xs text-gray-600">Loading preview...</p></div>
              ) : previewPdfUrl ? (
                <div className="bg-white shadow-md"><Document file={previewPdfUrl} onLoadError={(error) => console.error("PDF load error:", error)} loading={<div className="flex items-center justify-center p-8"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>}><Page pageNumber={1} renderTextLayer={false} renderAnnotationLayer={false} width={pageWidth} /></Document></div>
              ) : (
                <div className="text-center text-gray-500"><AlertCircle size={32} className="mx-auto mb-2 text-gray-400" /><p className="text-xs">Failed to load preview</p></div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
              <div className="text-xs text-gray-600 flex-1 min-w-0">
                <p className="font-medium mb-1">Participants</p>
                <div className="flex flex-wrap gap-1.5">{previewMeeting.participants.map((p, idx) => (
                  <span key={idx} className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap ${p.signed ? "bg-green-100 text-green-700" : p.isCurrent ? "bg-red-100 text-red-700 font-semibold" : "bg-gray-100 text-gray-600"}`}>{p.name} {p.signed ? "✓" : p.isCurrent ? "(You)" : ""}</span>
                ))}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={closePreview} className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded-lg">Close</button>
                <button onClick={() => router.push(`/sign/${previewMeeting._id}`)} className="px-4 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5">Sign Document →</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}