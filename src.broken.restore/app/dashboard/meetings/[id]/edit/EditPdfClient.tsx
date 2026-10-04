"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { FileText, Loader2 } from "lucide-react";

// Initialize PDF Worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Enhanced Thumbnail Component 
 * Handles both local file selection and remote fetching for preview.
 */
export default function EditPdfClient({ 
  file, 
  meetingId 
}: { 
  file: File | null; 
  meetingId: string 
}) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadPdf() {
      if (file) {
        setSource(URL.createObjectURL(file));
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${meetingId}/pdf`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Not found");

        const blob = await res.blob();
        // Verify it's actually a PDF
        if (blob.type !== "application/pdf") {
          console.error("Fetched file is not a PDF");
          setError(true);
          return;
        }

        setSource(URL.createObjectURL(blob));
      } catch (err) {
        setError(true);
      }
    }
    loadPdf();
  }, [file, meetingId]);

  if (error) return <FileText className="w-10 h-10 text-red-300 mx-auto" />;
  if (!source) return <Loader2 className="animate-spin text-indigo-500" />;

  return (
    <Document file={source}>
      <Page pageNumber={1} width={180} renderTextLayer={false} renderAnnotationLayer={false} />
    </Document>
  );
}
