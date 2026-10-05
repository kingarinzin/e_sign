"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Document, Page } from "react-pdf";

interface Props {
  blobUrl: string;
  numPages: number;
  setNumPages: (n: number) => void;
  renderPageOverlays: (pageNum: number) => React.ReactNode;
}

export default function ViewPdfClient({
  blobUrl,
  numPages,
  setNumPages,
  renderPageOverlays,
}: Props) {
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      setWorkerReady(true);
    });
  }, []);

  if (!workerReady) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  return (
    <Document
      file={blobUrl}
      onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
      onLoadError={(error) => console.error("PDF load error:", error)}
      loading={<Loader2 className="animate-spin" />}
    >
      {Array.from({ length: numPages }, (_, i) => {
        const pageNum = i + 1;
        return (
          <div key={pageNum} className="mb-6 shadow-xl relative">
            <Page
              pageNumber={pageNum}
              width={700}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
            {renderPageOverlays(pageNum)}
          </div>
        );
      })}
    </Document>
  );
}