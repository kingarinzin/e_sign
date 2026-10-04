"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { FileText, Upload, Loader2 } from "lucide-react";

// Initialize PDF Worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Internal Thumbnail Component to handle Local PDF Preview
 */
export default function NewMeetingPdfClient({ file }: { file: File | null }) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    if (file && file.type === "application/pdf") {
      const url = URL.createObjectURL(file);
      setSource(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setSource(null);
    }
  }, [file]);

  if (!file) return <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />;
  
  // Fallback for non-PDF files (like .docx) since react-pdf only renders PDFs
  if (file.type !== "application/pdf") {
    return (
      <div className="text-center p-4">
        <FileText className="w-12 h-12 text-indigo-500 mx-auto mb-2" />
        <p className="text-[10px] font-bold text-indigo-900 truncate w-32">{file.name}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-white">
      <Document
        file={source}
        loading={<Loader2 className="animate-spin text-indigo-500" size={24} />}
        error={<FileText className="w-12 h-12 text-red-200" />}
      >
        <Page 
          pageNumber={1} 
          width={180} 
          renderTextLayer={false} 
          renderAnnotationLayer={false} 
        />
      </Document>
    </div>
  );
}
