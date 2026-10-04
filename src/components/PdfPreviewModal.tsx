"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import {
  AlertCircle,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

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
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // ─── Fetch PDF ────────────────────────────────────────────────
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

  // ─── Track current page as user scrolls ───────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || numPages === 0) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerHeight = containerRect.height;

      // Find the page that's most visible
      let bestPage = 1;
      let bestVisible = 0;

      for (let page = 1; page <= numPages; page++) {
        const el = pageRefs.current[page];
        if (!el) continue;
        const rect = el.getBoundingClientRect();

        // Calculate visible portion of this page
        const visibleTop = Math.max(rect.top, containerTop);
        const visibleBottom = Math.min(
          rect.bottom,
          containerTop + containerHeight
        );
        const visible = Math.max(0, visibleBottom - visibleTop);

        if (visible > bestVisible) {
          bestVisible = visible;
          bestPage = page;
        }
      }

      setCurrentPage(bestPage);
    };

    container.addEventListener("scroll", handleScroll);
    handleScroll(); // Initial
    return () => container.removeEventListener("scroll", handleScroll);
  }, [numPages, pdfUrl]);

  // ─── Scroll to a specific page ────────────────────────────────
  const goToPage = (page: number) => {
    if (page < 1 || page > numPages) return;
    const el = pageRefs.current[page];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentPage(page);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
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
            className="p-1.5 hover:bg-gray-200 rounded-full transition-colors cursor-pointer"
          >
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Description */}
        {meeting.description && (
          <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
            <p className="text-xs font-medium text-blue-900 mb-1">
              Message from sender
            </p>
            <p className="text-xs text-blue-800 leading-relaxed">
              {meeting.description}
            </p>
          </div>
        )}

        {/* Page navigation bar */}
        {numPages > 1 && (
          <div className="px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-gray-600">
              Page{" "}
              <span className="font-bold text-gray-900">{currentPage}</span>{" "}
              of{" "}
              <span className="font-bold text-gray-900">{numPages}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                title="Previous page"
              >
                <ChevronLeft size={16} className="text-gray-600" />
              </button>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= numPages}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                title="Next page"
              >
                <ChevronRight size={16} className="text-gray-600" />
              </button>
            </div>
          </div>
        )}

        {/* PDF body — scrollable with all pages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-gray-100 p-4"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[300px]">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-xs text-gray-600">Loading preview...</p>
            </div>
          ) : pdfUrl ? (
            <Document
              file={pdfUrl}
              onLoadSuccess={(pdf) => {
                setNumPages(pdf.numPages);
                setCurrentPage(1);
              }}
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
              <div className="flex flex-col items-center gap-4">
                {Array.from({ length: numPages }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <div
                      key={pageNum}
                      ref={(el) => {
                        pageRefs.current[pageNum] = el;
                      }}
                      data-page-number={pageNum}
                      className="bg-white shadow-md"
                    >
                      {/* Small page label above each page */}
                      <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                        Page {pageNum}
                        {pageNum === currentPage && (
                          <span className="ml-2 text-indigo-600">
                            · viewing
                          </span>
                        )}
                      </div>
                      <Page
                        pageNumber={pageNum}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        width={pageWidth}
                        loading={
                          <div
                            className="flex items-center justify-center bg-gray-50"
                            style={{ width: pageWidth, height: pageWidth * 1.4 }}
                          >
                            <Loader2
                              className="animate-spin text-indigo-600"
                              size={24}
                            />
                          </div>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </Document>
          ) : (
            <div className="text-center text-gray-500 flex flex-col items-center justify-center h-full min-h-[300px]">
              <AlertCircle size={32} className="mx-auto mb-2 text-gray-400" />
              <p className="text-xs">Failed to load preview</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4 shrink-0">
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
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={onSign}
              className="px-4 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5 transition cursor-pointer"
            >
              Sign Document →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}