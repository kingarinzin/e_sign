"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Download, CheckCircle, AlertCircle } from "lucide-react";

export default function ViewDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [blobUrl, setBlobUrl] = useState<string>("");
  const [error, setError] = useState("");

  // ─── Fetch document + PDF blob ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let localBlobUrl = "";

    async function fetchDocument() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push(`/login?returnTo=/view/${id}`);
          return;
        }

        const meetingRes = await fetch(`/api/meetings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (!meetingRes.ok) {
          setError("Document not found");
          setLoading(false);
          return;
        }

        const meetingData = await meetingRes.json();
        const mtg = meetingData.meeting || meetingData;
        if (!cancelled) setMeeting(mtg);

        const pdfRes = await fetch(`/api/meetings/${id}/pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (cancelled) return;

        if (pdfRes.ok) {
          const blob = await pdfRes.blob();
          if (cancelled) return;
          // Force correct MIME type for the browser's PDF viewer
          const pdfBlob = new Blob([blob], { type: "application/pdf" });
          localBlobUrl = URL.createObjectURL(pdfBlob);
          setBlobUrl(localBlobUrl);
        } else {
          const errorData = await pdfRes.json().catch(() => ({}));
          if (errorData.error?.includes("missing")) {
            setError(
              "The PDF file for this document is missing from the server."
            );
          } else {
            setError("Failed to load PDF file");
          }
        }

        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("Error:", err);
          setError("Failed to load document");
          setLoading(false);
        }
      }
    }

    fetchDocument();

    return () => {
      cancelled = true;
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [id, router]);

  const handleDownload = async () => {
    if (!meeting) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/meetings/${id}/download`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        alert("Failed to download PDF");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${meeting.title || "document"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download PDF");
    }
  };

  // ─── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-sm font-semibold text-gray-500">
            Loading Document...
          </p>
        </div>
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#f8f9fc] flex flex-col">
        {meeting && (
          <header className="bg-white border-b px-8 py-4 shadow-sm sticky top-0 z-50">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {meeting.title}
                </h1>
                <p className="text-sm text-gray-500 mt-1">Document ID: {id}</p>
              </div>
              <button
                onClick={() => router.push("/dashboard")}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition cursor-pointer"
              >
                Back to Dashboard
              </button>
            </div>
          </header>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-lg bg-white p-8 rounded-lg shadow-md border border-red-200">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              PDF File Not Found
            </h2>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <p className="text-gray-600 text-sm mb-6">
              The document metadata exists, but the PDF file has been removed
              from the server.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-medium cursor-pointer"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success state — native browser PDF viewer ────────────────
  return (
    <div className="h-screen bg-[#f0f2f5] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b px-8 py-4 shadow-sm shrink-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {meeting?.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm text-green-600 font-medium">
                Fully Signed
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition flex items-center gap-2 cursor-pointer"
            >
              <Download size={16} />
              Download PDF
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Native PDF viewer */}
      <main className="flex-1 bg-gray-200 overflow-hidden">
        {blobUrl ? (
          <iframe
            src={blobUrl}
            className="w-full h-full border-0"
            title={meeting?.title || "Document"}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}
      </main>
    </div>
  );
}