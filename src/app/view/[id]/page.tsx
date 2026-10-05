"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Download, CheckCircle, AlertCircle } from "lucide-react";
import dynamic from "next/dynamic";

// Load the PDF viewer as a separate client-only module.
// This keeps react-pdf/pdfjs-dist OFF the server entirely.
const ViewPdfClient = dynamic(() => import("./ViewPdfClient"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="animate-spin text-indigo-600" size={32} />
    </div>
  ),
});

const renderKey = (page: number, x: number, y: number) =>
  `${page}-${Math.round(x / 5)}-${Math.round(y / 5)}`;

export default function ViewDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [blobUrl, setBlobUrl] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState("");

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
          if (blob.size === 0) {
            setError("PDF file is empty");
            setLoading(false);
            return;
          }
          const pdfBlob = new Blob([blob], { type: "application/pdf" });
          localBlobUrl = URL.createObjectURL(pdfBlob);
          setBlobUrl(localBlobUrl);
        } else {
          const errText = await pdfRes.text().catch(() => "");
          let errorData: any = {};
          try {
            errorData = JSON.parse(errText);
          } catch {}
          setError(
            errorData.error?.includes("missing")
              ? "The PDF file for this document is missing from the server."
              : "Failed to load PDF file"
          );
        }

        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error("Error:", err);
        if (!cancelled) {
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

  // ─── Collect signatures ────────────────────────────────────────
  const allSignatures: any[] = [];
  const allInitialSignatures: any[] = [];

  if (meeting?.participants) {
    meeting.participants
      .filter((p: any) => p.signed)
      .forEach((p: any) => {
        if (p.signaturePositions && Array.isArray(p.signaturePositions)) {
          p.signaturePositions.forEach((pos: any) => {
            allSignatures.push({
              ...pos,
              signature: p.signature,
              signerName: p.name || p.email,
            });
          });
        }
        if (
          p.initialSignaturePositions &&
          Array.isArray(p.initialSignaturePositions)
        ) {
          p.initialSignaturePositions.forEach((pos: any) => {
            allInitialSignatures.push({
              ...pos,
              signature: p.initialSignature,
              signerName: p.name || p.email,
            });
          });
        }
      });
  }

  const renderedSignatureKeys = new Set<string>();
  const renderedInitialKeys = new Set<string>();

  const renderPageOverlays = (pageNum: number) => {
    const pageSignatures = allSignatures.filter((sig) => sig.page === pageNum);
    const pageInitials = allInitialSignatures.filter(
      (sig) => sig.page === pageNum
    );

    return (
      <>
        {meeting?.fields &&
          Array.isArray(meeting.fields) &&
          meeting.fields
            .filter((f: any) => f.page === pageNum)
            .map((field: any, idx: number) => {
              const fieldOwner = meeting.participants?.find((p: any) => {
                const fieldRecipient = field.recipientName?.toLowerCase() || "";
                const pName = p.name?.toLowerCase() || "";
                const pEmail = p.email?.toLowerCase() || "";
                return (
                  fieldRecipient === pName ||
                  fieldRecipient === pEmail ||
                  pName.includes(fieldRecipient) ||
                  fieldRecipient.includes(pName)
                );
              });
              const ownerSigned = fieldOwner?.signed;

              if (
                field.type === "signature" &&
                ownerSigned &&
                fieldOwner?.signature
              ) {
                const key = renderKey(
                  field.page,
                  field.xPct * 700,
                  field.yPct * 900
                );
                if (renderedSignatureKeys.has(key)) return null;
                renderedSignatureKeys.add(key);
                return (
                  <div
                    key={field.id || idx}
                    className="absolute"
                    style={{
                      left: `${field.xPct * 100}%`,
                      top: `${field.yPct * 100}%`,
                      width: `${field.wPct * 100}%`,
                      height: `${field.hPct * 100}%`,
                    }}
                  >
                    <img
                      src={fieldOwner.signature}
                      alt="signature"
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                );
              }

              if (
                field.type === "initial" &&
                ownerSigned &&
                fieldOwner?.initialSignature
              ) {
                const key = renderKey(
                  field.page,
                  field.xPct * 700,
                  field.yPct * 900
                );
                if (renderedInitialKeys.has(key)) return null;
                renderedInitialKeys.add(key);
                return (
                  <div
                    key={field.id || idx}
                    className="absolute"
                    style={{
                      left: `${field.xPct * 100}%`,
                      top: `${field.yPct * 100}%`,
                      width: `${field.wPct * 100}%`,
                      height: `${field.hPct * 100}%`,
                    }}
                  >
                    <img
                      src={fieldOwner.initialSignature}
                      alt="initial signature"
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                );
              }

              if (field.type === "name" && ownerSigned && fieldOwner?.name) {
                return (
                  <div
                    key={field.id || idx}
                    className="absolute flex items-center justify-center h-full text-sm font-semibold text-gray-800"
                    style={{
                      left: `${field.xPct * 100}%`,
                      top: `${field.yPct * 100}%`,
                      width: `${field.wPct * 100}%`,
                      height: `${field.hPct * 100}%`,
                    }}
                  >
                    {fieldOwner.name}
                  </div>
                );
              }

              if (
                field.type === "date" &&
                ownerSigned &&
                fieldOwner?.signedAt
              ) {
                return (
                  <div
                    key={field.id || idx}
                    className="absolute flex items-center justify-center h-full text-xs text-gray-700"
                    style={{
                      left: `${field.xPct * 100}%`,
                      top: `${field.yPct * 100}%`,
                      width: `${field.wPct * 100}%`,
                      height: `${field.hPct * 100}%`,
                    }}
                  >
                    {new Date(fieldOwner.signedAt).toLocaleDateString()}
                  </div>
                );
              }
              return null;
            })}

        {pageSignatures.map((sig) => {
          const key = renderKey(sig.page, sig.x, sig.y);
          if (renderedSignatureKeys.has(key)) return null;
          renderedSignatureKeys.add(key);
          return (
            <div
              key={sig.id}
              className="absolute"
              style={{
                left: `${sig.x}px`,
                top: `${sig.y}px`,
                width: `${sig.width}px`,
                height: `${sig.height}px`,
              }}
            >
              <img
                src={sig.signature}
                alt="signature"
                className="w-full h-full object-contain"
              />
            </div>
          );
        })}

        {pageInitials.map((sig) => {
          const key = renderKey(sig.page, sig.x, sig.y);
          if (renderedInitialKeys.has(key)) return null;
          renderedInitialKeys.add(key);
          return (
            <div
              key={sig.id}
              className="absolute"
              style={{
                left: `${sig.x}px`,
                top: `${sig.y}px`,
                width: `${sig.width}px`,
                height: `${sig.height}px`,
              }}
            >
              <img
                src={sig.signature}
                alt="initial signature"
                className="w-full h-full object-contain"
              />
            </div>
          );
        })}
      </>
    );
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-[#f8f9fc] flex flex-col">
        <header className="bg-white border-b px-8 py-4 shadow-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {meeting?.title || "Document"}
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
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-lg bg-white p-8 rounded-lg shadow-md border border-red-200">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              PDF File Not Found
            </h2>
            <p className="text-red-600 text-sm mb-4">{error}</p>
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

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      <header className="bg-white border-b px-8 py-4 shadow-sm sticky top-0 z-50">
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

      <main className="flex-1 overflow-auto p-8 flex justify-center bg-[#e2e8f0]">
        <div className="max-w-3xl w-full">
          {blobUrl && (
            <ViewPdfClient
              blobUrl={blobUrl}
              numPages={numPages}
              setNumPages={setNumPages}
              renderPageOverlays={renderPageOverlays}
            />
          )}
        </div>
      </main>
    </div>
  );
}