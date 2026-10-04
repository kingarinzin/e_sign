"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";

// Initialize PDF Worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * PrepareThumbnails - Client component for rendering PDF page thumbnails
 */
export default function PrepareThumbnails({ 
  meetingId,
  numPages,
  onPageClick
}: { 
  meetingId: string;
  numPages: number;
  onPageClick: (pageNumber: number) => void;
}) {
  const [thumbnailBlobUrl, setThumbnailBlobUrl] = useState<string>("");

  useEffect(() => {
    let alive = true;
    let localBlobUrl = "";

    async function fetchPdfForThumbnails() {
      if (!meetingId) return;
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch(`/api/meetings/${meetingId}/pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        localBlobUrl = URL.createObjectURL(blob);
        if (alive) setThumbnailBlobUrl(localBlobUrl);
      } catch (err) {
        console.error("Error fetching PDF for thumbnails:", err);
      }
    }

    fetchPdfForThumbnails();
    return () => {
      alive = false;
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [meetingId]);

  if (!thumbnailBlobUrl) {
    return (
      <div className="text-[10px] text-gray-400 text-center py-4">
        <Loader2 className="animate-spin mx-auto mb-2" size={16} />
        Loading...
      </div>
    );
  }

  return (
    <Document file={thumbnailBlobUrl}>
      <div className="space-y-2">
        {Array.from({ length: numPages }, (_, i) => (
          <div
            key={i + 1}
            className="border border-gray-300 rounded p-2 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 cursor-pointer transition"
            onClick={() => onPageClick(i + 1)}
          >
            <div className="text-[10px] font-semibold text-gray-600 mb-1">
              Page {i + 1}
            </div>
            <div className="w-full bg-white border border-gray-200 rounded overflow-hidden">
              <Page
                pageNumber={i + 1}
                width={140}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          </div>
        ))}
      </div>
    </Document>
  );
}
