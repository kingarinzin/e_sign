"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  FileText,
  Users,
  Eye,
  Download,
} from "lucide-react";
import SignerTrace from "./SignerTrace";

interface Participant {
  name: string;
  email: string;
  signed: boolean;
  isCurrent?: boolean;
  role?: string;
  signedAt?: string;
  lastRemindedAt?: string;
  order?: number;
}

interface Meeting {
  _id: string;
  title: string;
  sentAt?: string;
  description?: string;
  status?: string;
  participants: Participant[];
  organizerId?: string;
}

interface Props {
  meeting: Meeting;
  pageWidth: number;
  onClose: () => void;
  onSign: () => void;
  currentUserEmail?: string | null;
  currentUserId?: string | null;
}

export default function PdfPreviewModal({
  meeting,
  pageWidth: _pageWidth,
  onClose,
  onSign,
  currentUserEmail = null,
  currentUserId = null,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"pdf" | "signers">("pdf");
  const [refreshKey, setRefreshKey] = useState(0);

  // Determine if the current user is the organizer
  const isOrganizer =
    !!currentUserId &&
    !!meeting.organizerId &&
    (typeof meeting.organizerId === "string"
      ? meeting.organizerId === currentUserId
      : (meeting.organizerId as any).toString() === currentUserId);

  // ─── Fetch PDF as blob ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${meeting._id}/pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (res.ok) {
          const blob = await res.blob();
          if (cancelled) return;
          const pdfBlob = new Blob([blob], { type: "application/pdf" });
          createdUrl = URL.createObjectURL(pdfBlob);
          setPdfUrl(createdUrl);
        } else {
          if (!cancelled) setError("Failed to load PDF");
        }
      } catch (err) {
        console.error("Failed to load PDF preview:", err);
        if (!cancelled) setError("Failed to load PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [meeting._id]);

  const openInNewTab = () => {
    if (pdfUrl) window.open(pdfUrl, "_blank");
  };

  // Refresh meeting data after a reminder is sent
  const handleReminderSent = () => {
    setRefreshKey((k) => k + 1);
  };

  // Count of unsigned signers for the tab badge
  const unsignedCount = meeting.participants.filter(
    (p) => (p.role === "Signer" || !p.role) && !p.signed
  ).length;
  const totalSigners = meeting.participants.filter(
    (p) => p.role === "Signer" || !p.role
  ).length;
  const signedCount = totalSigners - unsignedCount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full h-[90vh] overflow-hidden flex flex-col">
        {/* ─── Header ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex-1 pr-4 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {meeting.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {meeting.sentAt
                ? `Sent ${new Date(meeting.sentAt).toLocaleDateString()}`
                : "Pending signature"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {pdfUrl && activeTab === "pdf" && (
              <button
                onClick={openInNewTab}
                className="p-1.5 hover:bg-gray-200 rounded-full transition-colors cursor-pointer"
                title="Open in new tab"
              >
                <ExternalLink size={16} className="text-gray-600" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-200 rounded-full transition-colors cursor-pointer"
              title="Close"
            >
              <X size={18} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* ─── Tabs ──────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => setActiveTab("pdf")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition cursor-pointer ${
              activeTab === "pdf"
                ? "text-indigo-700 border-b-2 border-indigo-600 -mb-px"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <FileText size={14} />
            Document
          </button>
          <button
            onClick={() => setActiveTab("signers")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition cursor-pointer ${
              activeTab === "signers"
                ? "text-indigo-700 border-b-2 border-indigo-600 -mb-px"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Users size={14} />
            Signers
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === "signers"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {signedCount}/{totalSigners}
            </span>
          </button>
        </div>

        {/* ─── Description (only on PDF tab) ─────────────── */}
        {activeTab === "pdf" && meeting.description && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
            <p className="text-xs font-medium text-blue-900 mb-1">
              Message from sender
            </p>
            <p className="text-xs text-blue-800 leading-relaxed">
              {meeting.description}
            </p>
          </div>
        )}

        {/* ─── Body ──────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative bg-gray-200">
          {activeTab === "pdf" ? (
            loading ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
                <p className="text-xs text-gray-600">Loading preview...</p>
              </div>
            ) : pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full border-0"
                title={meeting.title}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <AlertCircle size={32} className="mb-2 text-gray-400" />
                <p className="text-xs">{error || "Failed to load preview"}</p>
              </div>
            )
          ) : (
            <div className="w-full h-full bg-white">
              <SignerTrace
                key={refreshKey}
                meeting={{
                  _id: meeting._id,
                  title: meeting.title,
                  status: meeting.status || "Sent",
                  sentAt: meeting.sentAt,
                  participants: meeting.participants.map((p) => ({
                    ...p,
                    role: p.role || "Signer",
                  })),
                }}
                currentUserEmail={currentUserEmail}
                isOrganizer={isOrganizer}
                onReminderSent={handleReminderSent}
              />
            </div>
          )}
        </div>

        {/* ─── Footer ────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Eye size={12} />
            <span>
              {signedCount} of {totalSigners} signed
              {unsignedCount > 0 && (
                <span className="text-gray-400 ml-1">
                  · {unsignedCount} pending
                </span>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition cursor-pointer"
            >
              Close
            </button>
            {meeting.status !== "Completed" && meeting.status !== "Draft" && (
              <button
                onClick={onSign}
                className="px-4 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5 transition cursor-pointer"
              >
                Sign Document →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}