"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { pdfjs } from "react-pdf";
import { AlertCircle, Loader2, X } from "lucide-react";

// Worker served from /public — no external CDN.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const Document = dynamic(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false }
);

const Page = dynamic(
  () => import("react-pdf").then((m) => m.Page),
  { ssr: false }
);

interface Participant {
  name: string;
  email: string;
  signed: boolean;
  isCurrent?: boolean;
}

interface Meeting {
  _id: string;
  title: string;
  sentAt?: string;
  description?: string;
  participants: Participant[];
}

interface Props {
  meeting: Meeting;
  pageWidth: number;
  onClose: () => void;
  onSign: () => void;
}

export default function PdfPreviewModal({
  meeting,
  pageWidth,
  onClose,
  onSign,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${meeting._id}/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const blob = await res.blob();
          createdUrl = URL.createObjectURL(blob);
          setPdfUrl(createdUrl);
        }
      } catch (err) {
        console.error("Failed to load PDF preview:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [meeting._id]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex-1 pr-4">
            <h3 className="text-base font-semibold text-gray-900">
              {meeting.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {meeting.sentAt
                ? `Sent ${new Date(meeting.sentAt).toLocaleDateString()}`
                : "Pending signature"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Description */}
        {meeting.description && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
            <p className="text-xs font-medium text-blue-900 mb-1">
              Message from sender
            </p>
            <p className="text-xs text-blue-800 leading-relaxed">
              {meeting.description}
            </p>
          </div>
        )}

        {/* PDF body */}
        <div className="flex-1 overflow-y-auto bg-gray-100 flex items-center justify-center p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-xs text-gray-600">Loading preview...</p>
            </div>
          ) : pdfUrl ? (
            <div className="bg-white shadow-md">
              <Document
                file={pdfUrl}
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
          <div className="text-xs text-gray-600 flex-1 min-w-0">
            <p className="font-medium mb-1">Participants</p>
            <div className="flex flex-wrap gap-1.5">
              {meeting.participants.map((p, idx) => (
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
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded-lg"
            >
              Close
            </button>
            <button
              onClick={onSign}
              className="px-4 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5"
            >
              Sign Document →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}