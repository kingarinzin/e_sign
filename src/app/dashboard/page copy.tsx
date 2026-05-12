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
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

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

    return () => {
      window.removeEventListener("resize", updatePageWidth);
    };
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
        }
      } catch (err) {
        console.error("Token validation error:", err);
      }
    }

    checkTokenValidity();
  }, [router]);

  useEffect(() => {
    async function loadProfile() {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setSignatureImg(data.signature || null);
          setInitialsImg(data.initials || null);

          if (data.signature) {
            localStorage.setItem("userSignature", data.signature);
          }
        }
      } catch (err) {
        console.error("Profile load error:", err);
      }
    }

    loadProfile();
  }, []);

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
      if (!document.hidden) {
        fetchMeetings();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    async function loadProfile() {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSignatureImg(data.signature || null);
        setInitialsImg(data.initials || null);
      }
    }

    loadProfile();
  }, []);

  const drafts = meetings.filter((m) => m.status === "Draft");
  const pendingCount = meetings.filter(
    (m) => m.status === "Sent" && m.participants.some((p) => !p.signed)
  ).length;
  const completedCount = meetings.filter(
    (m) => m.status === "Completed"
  ).length;

  const needToSign = meetings.filter((m) => {
    if (!userEmail) return false;
    const myParticipant = m.participants.find((p) => p.email === userEmail);
    return myParticipant && !myParticipant.signed && myParticipant.isCurrent;
  });

  const getSigningProgress = (meeting: Meeting) => {
    const signers = meeting.participants.filter((p) => p.signed !== undefined);
    const signed = signers.filter((p) => p.signed).length;
    return { signed, total: signers.length };
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
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
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
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#2d3748] flex">
      <div className="w-64 shrink-0"></div>
      <Sidebar />

      <div className="flex-1 flex flex-col">
        <header className="bg-white px-8 py-7 flex justify-between items-center sticky top-0 z-20 -ml-64 pl-72">
          <h1 className="text-xl font-semibold text-gray-800">Dashboard</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard/new-meeting")}
              className="bg-[#1a2b4a] cursor-pointer text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2 hover:bg-[#2a3b5a] transition"
            >
              New Document +
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-8 space-y-8">
          {needToSign.length > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="bg-red-500 p-2 rounded-full text-white shrink-0 mt-0.5">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-red-900 mb-1">
                      {needToSign.length} Document
                      {needToSign.length > 1 ? "s" : ""} Awaiting Your Signature
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
                                  ? `Sent ${new Date(
                                      meeting.sentAt
                                    ).toLocaleDateString()}`
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
                            Sign Now -
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section className="bg-white overflow-hidden border border-gray-200 rounded-lg">
              <div className="px-6 py-4 bg-gray-100 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">
                  Documents
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="bg-red-500 p-2 rounded text-white">
                          <AlertCircle size={20} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          Awaiting my signature
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right bg-gray-50">
                      <span className="text-sm font-semibold text-gray-900">
                        {needToSign.length}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-500 p-2 rounded text-white">
                          <Clock size={20} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          Waiting for others
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right bg-gray-50">
                      <span className="text-sm font-semibold text-gray-900">
                        {pendingCount}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-700 p-2 rounded text-white">
                          <CheckCircle2 size={20} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          Completed
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-right bg-gray-50">
                      <span className="text-sm font-semibold text-gray-900">
                        {completedCount}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section className="bg-gray-50 overflow-hidden border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-800">
                  Recent activity
                </h3>
              </div>
              <div className="p-4 space-y-4 min-h-40 bg-white">
                {meetings.length > 0 ? (
                  meetings.slice(0, 4).map((m, i) => {
                    const progress = getSigningProgress(m);
                    const statusColor =
                      m.status === "Completed"
                        ? "text-green-600"
                        : m.status === "Sent"
                        ? "text-blue-600"
                        : m.status === "Prepared"
                        ? "text-indigo-600"
                        : "text-amber-600";

                    return (
                      <div
                        key={i}
                        className="text-xs text-gray-600 border-b border-gray-50 pb-2"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span>
                            <span className="font-semibold text-indigo-900">
                              {m.title}
                            </span>
                          </span>
                          <span className="text-gray-400 text-[10px]">
                            {m.sentAt
                              ? new Date(m.sentAt).toLocaleDateString()
                              : m.createdAt
                              ? new Date(m.createdAt).toLocaleDateString()
                              : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${statusColor}`}>
                            {m.status}
                          </span>
                          {m.status === "Sent" && (
                            <span className="text-[10px] text-gray-500">
                              {progress.signed}/{progress.total} signed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-xs italic">
                    No activity yet
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="space-y-4">
              <div
                onClick={() => sigInputRef.current?.click()}
                className="bg-gray-50 border border-gray-300 p-4 flex justify-between items-start relative overflow-hidden h-28 cursor-pointer hover:bg-gray-100 transition group"
              >
                <input
                  type="file"
                  ref={sigInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "signature")}
                />
                <div className="z-10">
                  <h4 className="text-xs font-semibold text-gray-700">
                    My Signature
                  </h4>
                  <button className="text-xs text-blue-600 mt-1 flex items-center gap-1 hover:underline cursor-pointer">
                    Edit
                  </button>
                </div>
                <div className="absolute right-8 top-0 bottom-0 flex items-center justify-center w-1/2">
                  {signatureImg ? (
                    <img
                      src={signatureImg}
                      alt="Signature"
                      className="max-h-20 object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-gray-300">
                      <Upload size={20} />
                      <span className="text-[10px] uppercase font-bold mt-1">
                        Upload
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div
                onClick={() => initialsInputRef.current?.click()}
                className="bg-gray-50 border border-gray-300 p-4 flex justify-between items-start relative overflow-hidden h-28 cursor-pointer hover:bg-gray-100 transition group"
              >
                <input
                  type="file"
                  ref={initialsInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, "initials")}
                />
                <div className="z-10">
                  <h4 className="text-xs font-semibold text-gray-700">
                    My Initials
                  </h4>
                  <button className="text-xs text-blue-600 mt-1 flex items-center gap-1 hover:underline cursor-pointer">
                    Edit
                  </button>
                </div>
                <div className="absolute right-12 top-0 bottom-0 flex items-center justify-center w-1/3">
                  {initialsImg ? (
                    <img
                      src={initialsImg}
                      alt="Initials"
                      className="max-h-16 object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-gray-300">
                      <Upload size={20} />
                      <span className="text-[10px] uppercase font-bold mt-1">
                        Upload
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {isUploading && (
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <Loader2 className="animate-spin" size={14} />
                  Uploading...
                </div>
              )}
            </div>

            <section className="bg-gray-50 overflow-hidden border border-gray-200 self-stretch flex flex-col rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-gray-800">
                  Recent Drafts
                </h3>
                {drafts.length > 0 && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                    {drafts.length} Total
                  </span>
                )}
              </div>
              <div className="flex-1 bg-white min-h-56">
                {drafts.length > 0 ? (
                  drafts.slice(0, 5).map((draft) => (
                    <div
                      key={draft._id}
                      onClick={() =>
                        router.push(`/dashboard/meetings/${draft._id}/edit`)
                      }
                      className="flex justify-between p-4 border-b text-sm items-center hover:bg-gray-50 group cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Edit3
                          size={14}
                          className="text-gray-400 group-hover:text-blue-600"
                        />
                        <span className="font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                          {draft.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400 text-xs">
                          {draft.createdAt
                            ? new Date(draft.createdAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                }
                              )
                            : ""}
                        </span>
                        <span className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-600 font-bold uppercase transition-opacity">
                          Edit
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-gray-400 text-xs italic">
                    No drafts to show
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      {previewMeeting && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
              <div className="flex-1 pr-4">
                <h3 className="text-base font-semibold text-gray-900">
                  {previewMeeting.title}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {previewMeeting.sentAt
                    ? `Sent ${new Date(
                        previewMeeting.sentAt
                      ).toLocaleDateString()}`
                    : "Pending signature"}
                </p>
              </div>
              <button
                onClick={closePreview}
                className="p-1.5 hover:bg-gray-200 rounded-full transition-colors flex-shrink-0 cursor-pointer"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            {previewMeeting.description && (
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-medium text-blue-900 mb-1">
                  Message from sender
                </p>
                <p className="text-xs text-blue-800 leading-relaxed">
                  {previewMeeting.description}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto bg-gray-100 flex items-center justify-center p-4">
              {previewLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin text-indigo-600" size={32} />
                  <p className="text-xs text-gray-600">Loading preview...</p>
                </div>
              ) : previewPdfUrl ? (
                <div className="bg-white shadow-md">
                  <Document
                    file={previewPdfUrl}
                    onLoadError={(error) =>
                      console.error("PDF load error:", error)
                    }
                    loading={
                      <div className="flex items-center justify-center p-8">
                        <Loader2
                          className="animate-spin text-indigo-600"
                          size={28}
                        />
                      </div>
                    }
                  >
                    <Page
                      pageNumber={1}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      width={pageWidth}
                    />
                  </Document>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <AlertCircle size={32} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-xs">Failed to load preview</p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
              <div className="text-xs text-gray-600 flex-1 min-w-0">
                <p className="font-medium mb-1">Participants</p>
                <div className="flex flex-wrap gap-1.5">
                  {previewMeeting.participants.map((p, idx) => (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap ${
                        p.signed
                          ? "bg-green-100 text-green-700"
                          : p.isCurrent
                          ? "bg-red-100 text-red-700 font-semibold"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {p.name} {p.signed ? "✓" : p.isCurrent ? "(You)" : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={closePreview}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => router.push(`/sign/${previewMeeting._id}`)}
                  className="px-4 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  Sign Document -
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}