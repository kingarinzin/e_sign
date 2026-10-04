"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2, Send, PenTool, CheckCircle2, Trash2 } from "lucide-react";
import { Rnd } from "react-rnd";
import SuccessModal from "@/components/SuccessModal";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function SigningView({
  meeting,
  meetingId,
  currentUser,
}: {
  meeting: any;
  meetingId: string;
  currentUser: any;
}) {
  const router = useRouter();
  const [numPages, setNumPages] = useState(0);
  const [blobUrl, setBlobUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  // ─── Full Signature ──────────────────────────────────────────────
  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [freeformSignatures, setFreeformSignatures] = useState<Array<{
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // ─── Initial Signature ──────────────────────────────────────────
  const [userInitialSignature, setUserInitialSignature] = useState<string | null>(null);
  const [hasDrawnInitialSignature, setHasDrawnInitialSignature] = useState(false);
  const initialCanvasRef = useRef<HTMLCanvasElement>(null);
  const [freeformInitialSignatures, setFreeformInitialSignatures] = useState<Array<{
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>>([]);

  // ─── Org Badges ──────────────────────────────────────────────────
  const [freeformOrgBadges, setFreeformOrgBadges] = useState<Array<{
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    type: 'department' | 'division';
    text: string;
  }>>([]);

  const [isDraggingSignature, setIsDraggingSignature] = useState(false);
  const [draggingItemType, setDraggingItemType] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [signSuccessMessage, setSignSuccessMessage] = useState("");
  const [signatureError, setSignatureError] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pageRects, setPageRects] = useState<Record<number, { width: number; height: number }>>({});

  // ─── Fetch PDF ────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchPdf() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${meetingId}/pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to fetch PDF");

        const blob = await res.blob();
        setBlobUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error("Error fetching PDF:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPdf();
  }, [meetingId]);

  // ─── Load user signatures from profile ──────────────────────────
  useEffect(() => {
    async function loadSignatures() {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.signature) {
          setUserSignature(data.signature);
          setHasDrawnSignature(true);
        }
        if (data.initialSignature) {
          setUserInitialSignature(data.initialSignature);
          setHasDrawnInitialSignature(true);
        }
      }
    }
    loadSignatures();
  }, []);

  // ─── Canvas Drawing Functions (Full Signature) ──────────────────
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawnSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSignature(false);
  };

  const saveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setUserSignature(dataUrl);
    const token = localStorage.getItem("token");
    await fetch("/api/user/update-signature", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ signature: dataUrl }),
    });
  };

  // ─── Drawing Functions for Initial Signature ────────────────────
  const startInitialDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = initialCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const drawInitial = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = initialCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawnInitialSignature(true);
  };

  const stopInitialDrawing = () => {
    setIsDrawing(false);
  };

  const clearInitialSignature = () => {
    const canvas = initialCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnInitialSignature(false);
  };

  const saveInitialSignature = async () => {
    const canvas = initialCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setUserInitialSignature(dataUrl);
    const token = localStorage.getItem("token");
    await fetch("/api/user/update-signature", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ initialSignature: dataUrl }),
    });
  };

  // ─── Apply Initials to All Pages ────────────────────────────────
  const applyInitialsToAllPages = () => {
    if (freeformInitialSignatures.length === 0) {
      alert("Please place an initial signature first.");
      return;
    }

    const template = freeformInitialSignatures[0];
    const allPageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
    const existingPages = new Set(freeformInitialSignatures.map(s => s.page));

    const newEntries = allPageNumbers
      .filter(page => !existingPages.has(page))
      .map(page => ({
        ...template,
        id: makeId(),
        page,
      }));

    if (newEntries.length === 0) {
      alert("All pages already have an initial signature.");
      return;
    }

    setFreeformInitialSignatures(prev => [...prev, ...newEntries]);
  };

  // ─── Drag Handlers ───────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent) => {
    if (!userSignature) {
      e.preventDefault();
      alert("Please create or draw your signature first");
      return;
    }
    setIsDraggingSignature(true);
    setDraggingItemType("signature");
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", "signature");
  };

  const handleInitialDragStart = (e: React.DragEvent) => {
    if (!userInitialSignature) {
      e.preventDefault();
      alert("Please create or draw your initial signature first");
      return;
    }
    setIsDraggingSignature(true);
    setDraggingItemType("initial");
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", "initial");
  };

  const handleDragEnd = () => {
    setIsDraggingSignature(false);
    setDraggingItemType(null);
  };

  const handleDragOverPage = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingItemType) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDropOnPage = (e: React.DragEvent, pageNum: number) => {
    e.preventDefault();
    e.stopPropagation();
    const dragData = e.dataTransfer.getData("text/plain");
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragData === "initial" && userInitialSignature) {
      setFreeformInitialSignatures(prev => [
        ...prev,
        {
          id: makeId(),
          page: pageNum,
          x: x - 50,
          y: y - 20,
          width: 100,
          height: 40,
        }
      ]);
    }
    else if (dragData === "signature" && userSignature) {
      setFreeformSignatures(prev => [
        ...prev,
        {
          id: makeId(),
          page: pageNum,
          x: x - 70,
          y: y - 25,
          width: 140,
          height: 50,
        }
      ]);
    }
    else if (dragData.startsWith("department:")) {
      const deptName = dragData.replace("department:", "");
      setFreeformOrgBadges(prev => [
        ...prev,
        {
          id: makeId(),
          page: pageNum,
          x: x - 50,
          y: y - 15,
          width: 100,
          height: 30,
          type: 'department',
          text: deptName,
        }
      ]);
    }
    else if (dragData.startsWith("division:")) {
      const divName = dragData.replace("division:", "");
      setFreeformOrgBadges(prev => [
        ...prev,
        {
          id: makeId(),
          page: pageNum,
          x: x - 50,
          y: y - 15,
          width: 100,
          height: 30,
          type: 'division',
          text: divName,
        }
      ]);
    }

    setIsDraggingSignature(false);
    setDraggingItemType(null);
  };

  // ─── Handle Sign Submission ──────────────────────────────────────
  const handleSign = async () => {
    setSignatureError("");
    setValidationError(null);

    const finalFullSignature = userSignature || (hasDrawnSignature ? canvasRef.current?.toDataURL("image/png") : null);
    const finalInitialSignature = userInitialSignature || (hasDrawnInitialSignature ? initialCanvasRef.current?.toDataURL("image/png") : null);

    const hasFullPlaced = freeformSignatures.length > 0;
    const hasInitialPlaced = freeformInitialSignatures.length > 0;

    if (!hasFullPlaced && !hasInitialPlaced) {
      setValidationError("Please place at least one signature (full or initial) on the document.\n\nDrag your signature from the right sidebar onto the document.");
      setSignatureError("Please drag and place your signature on the document before signing");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!finalFullSignature && !finalInitialSignature) {
      setValidationError("Please create or draw a signature (full or initial) before signing.");
      setSignatureError("Please create your signature before signing");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (hasDrawnSignature && !userSignature) {
      await saveSignature();
    }
    if (hasDrawnInitialSignature && !userInitialSignature) {
      await saveInitialSignature();
    }

    setSigning(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/meetings/${meetingId}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          signature: finalFullSignature,
          signaturePositions: freeformSignatures,
          initialSignature: finalInitialSignature,
          initialSignaturePositions: freeformInitialSignatures,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to sign");
      }

      const data = await res.json();
      setSignSuccessMessage(data.message || "Document signed successfully!");
      setShowSuccessModal(true);
    } catch (err: any) {
      alert(err.message || "Failed to sign document");
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  // ─── Existing: myFields, previousSignatures ─────────────────────
  const myFields = meeting.fields?.filter((f: any) => {
    const recipientName = f.recipientName?.toLowerCase();
    const userName = currentUser.name?.toLowerCase();
    const userEmail = currentUser.email?.toLowerCase();
    return recipientName === userName || recipientName === userEmail;
  }) || [];

  const signedParticipants = meeting.participants?.filter((p: any) => p.signed) || [];
  const previousSignatures: Array<{
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    signature: string;
    signerName: string;
  }> = [];

  signedParticipants.forEach((p: any) => {
    if (p.signaturePositions && Array.isArray(p.signaturePositions)) {
      p.signaturePositions.forEach((pos: any) => {
        previousSignatures.push({
          ...pos,
          signature: p.signature,
          signerName: p.name || p.email,
        });
      });
    }
  });

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#f0f2f5] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-8 py-4 shadow-sm z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{meeting.title}</h1>
          </div>
          <button
            onClick={handleSign}
            disabled={signing || (!userSignature && !hasDrawnSignature && !userInitialSignature && !hasDrawnInitialSignature)}
            className="bg-[#1a2b4a] text-white px-6 py-2 rounded-lg font-semibold hover:bg-[#0f1b2e] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {signing ? (
              <><Loader2 className="animate-spin" size={16} /> Signing...</>
            ) : (
              <><Send size={16} /> Sign & Submit</>
            )}
          </button>
        </div>
      </header>

      {/* Error Message */}
      {signatureError && (
        <div className="bg-red-50 border-l-4 border-red-500 px-8 py-4 z-40">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">{signatureError}</p>
              </div>
              <button
                onClick={() => setSignatureError("")}
                className="ml-auto text-red-500 hover:text-red-700 cursor-pointer"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Page Thumbnails */}
        <aside className="w-48 bg-white border-r p-3 overflow-y-auto z-40 shadow-sm flex-shrink-0">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Pages
          </h3>
          {blobUrl ? (
            <Document file={blobUrl}>
              <div className="space-y-2">
                {Array.from({ length: numPages }, (_, i) => (
                  <div
                    key={i + 1}
                    className="border border-gray-300 rounded p-2 bg-gray-50 hover:bg-blue-50 hover:border-blue-400 cursor-pointer transition"
                    onClick={() => {
                      const pageElement = document.getElementById(`pdf-page-${i + 1}`);
                      if (pageElement) {
                        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
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
          ) : (
            <div className="text-[10px] text-gray-400 text-center py-4">Loading...</div>
          )}
        </aside>

        {/* Center: Document Preview */}
        <main className="flex-1 overflow-auto p-8 flex justify-center bg-[#e2e8f0]">
          <div className="max-w-3xl">
            {blobUrl && (
              <Document
                file={blobUrl}
                onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
                loading={<Loader2 className="animate-spin" />}
              >
                {Array.from({ length: numPages }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <div
                      key={pageNum}
                      id={`pdf-page-${pageNum}`}
                      className="mb-6 shadow-xl relative"
                      onDragOver={handleDragOverPage}
                      onDrop={(e) => handleDropOnPage(e, pageNum)}
                    >
                      <Page
                        pageNumber={pageNum}
                        width={700}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        onLoadSuccess={(page) => {
                          setPageRects(prev => ({
                            ...prev,
                            [pageNum]: { width: page.width, height: page.height }
                          }));
                        }}
                      />

                      {/* ─── Previous signers' full signatures ─── */}
                      {previousSignatures
                        .filter(sig => sig.page === pageNum)
                        .map((sig) => (
                          <div
                            key={sig.id}
                            className="absolute border-2 border-green-500 rounded bg-white shadow-lg"
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
                              className="w-full h-full object-contain p-1"
                            />
                          </div>
                        ))}

                      {/* ─── Name & Date fields ──────────────────────── */}
                      {meeting.fields
                        ?.filter((f: any) => f.page === pageNum && f.type !== 'signature' && f.type !== 'initial')
                        .map((field: any, idx: number) => {
                          const isMyField = myFields.some((mf: any) => mf.id === field.id);
                          const fieldRecipient = field.recipientName?.toLowerCase() || '';
                          const fieldOwner = meeting.participants?.find((p: any) => {
                            const pName = p.name?.toLowerCase() || '';
                            const pEmail = p.email?.toLowerCase() || '';
                            return fieldRecipient === pName || fieldRecipient === pEmail ||
                                   pName.includes(fieldRecipient) || fieldRecipient.includes(pName);
                          });
                          const ownerSigned = fieldOwner?.signed;
                          const displayName = field.recipientName || fieldOwner?.name || 'Pending';

                          return (
                            <div
                              key={field.id || idx}
                              className={`absolute border-2 rounded ${
                                ownerSigned
                                  ? 'border-green-500 bg-green-100 bg-opacity-20'
                                  : 'border-gray-400 bg-gray-100 bg-opacity-20'
                              }`}
                              style={{
                                left: `${field.xPct * 100}%`,
                                top: `${field.yPct * 100}%`,
                                width: `${field.wPct * 100}%`,
                                height: `${field.hPct * 100}%`,
                              }}
                            >
                              {field.type === 'name' && (
                                <div className="flex items-center justify-center h-full text-sm font-semibold text-gray-800 px-2">
                                  {ownerSigned ? fieldOwner.name : (isMyField ? currentUser.name : displayName)}
                                </div>
                              )}
                              {field.type === 'date' && (
                                <div className="flex items-center justify-center h-full text-xs text-gray-700 px-2">
                                  {ownerSigned
                                    ? new Date(fieldOwner.signedAt).toLocaleDateString()
                                    : (isMyField ? new Date().toLocaleDateString() : new Date().toLocaleDateString())
                                  }
                                </div>
                              )}
                            </div>
                          );
                        })}

                      {/* ─── User's full signatures placed ────────── */}
                      {freeformSignatures
                        .filter(sig => sig.page === pageNum)
                        .map((sig) => (
                          <Rnd
                            key={sig.id}
                            size={{ width: sig.width, height: sig.height }}
                            position={{ x: sig.x, y: sig.y }}
                            bounds="parent"
                            disableDragging={isDraggingSignature}
                            onDragStop={(e, d) => {
                              setFreeformSignatures(prev =>
                                prev.map(s => s.id === sig.id ? { ...s, x: d.x, y: d.y } : s)
                              );
                            }}
                            onResizeStop={(e, dir, ref, delta, position) => {
                              setFreeformSignatures(prev =>
                                prev.map(s => s.id === sig.id ? {
                                  ...s,
                                  x: position.x,
                                  y: position.y,
                                  width: ref.offsetWidth,
                                  height: ref.offsetHeight,
                                } : s)
                              );
                            }}
                          >
                            <div className="w-full h-full border-2 border-blue-500 rounded bg-white shadow-lg group relative">
                              <img
                                src={userSignature || ''}
                                alt="signature"
                                className="w-full h-full object-contain p-1 pointer-events-none"
                              />
                              <button
                                onClick={() => setFreeformSignatures(prev => prev.filter(s => s.id !== sig.id))}
                                className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer hover:bg-red-600"
                                title="Remove signature"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </Rnd>
                        ))}

                      {/* ─── User's initial signatures placed ────── */}
                      {freeformInitialSignatures
                        .filter(sig => sig.page === pageNum)
                        .map((sig) => (
                          <Rnd
                            key={sig.id}
                            size={{ width: sig.width, height: sig.height }}
                            position={{ x: sig.x, y: sig.y }}
                            bounds="parent"
                            disableDragging={isDraggingSignature}
                            onDragStop={(e, d) => {
                              setFreeformInitialSignatures(prev =>
                                prev.map(s => s.id === sig.id ? { ...s, x: d.x, y: d.y } : s)
                              );
                            }}
                            onResizeStop={(e, dir, ref, delta, position) => {
                              setFreeformInitialSignatures(prev =>
                                prev.map(s => s.id === sig.id ? {
                                  ...s,
                                  x: position.x,
                                  y: position.y,
                                  width: ref.offsetWidth,
                                  height: ref.offsetHeight,
                                } : s)
                              );
                            }}
                          >
                            <div className="w-full h-full border-2 border-purple-500 rounded bg-white shadow-lg group relative">
                              <img
                                src={userInitialSignature || ''}
                                alt="initial signature"
                                className="w-full h-full object-contain p-1 pointer-events-none"
                              />
                              <button
                                onClick={() => setFreeformInitialSignatures(prev => prev.filter(s => s.id !== sig.id))}
                                className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer hover:bg-red-600"
                                title="Remove initial signature"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </Rnd>
                        ))}

                      {/* ─── Department/Division badges ────────────── */}
                      {freeformOrgBadges
                        .filter(badge => badge.page === pageNum)
                        .map((badge) => (
                          <Rnd
                            key={badge.id}
                            size={{ width: badge.width, height: badge.height }}
                            position={{ x: badge.x, y: badge.y }}
                            bounds="parent"
                            disableDragging={draggingItemType !== null}
                            onDragStop={(e, d) => {
                              setFreeformOrgBadges(prev =>
                                prev.map(b => b.id === badge.id ? { ...b, x: d.x, y: d.y } : b)
                              );
                            }}
                            onResizeStop={(e, dir, ref, delta, position) => {
                              setFreeformOrgBadges(prev =>
                                prev.map(b => b.id === badge.id ? {
                                  ...b,
                                  x: position.x,
                                  y: position.y,
                                  width: ref.offsetWidth,
                                  height: ref.offsetHeight,
                                } : b)
                              );
                            }}
                          >
                            <div className={`w-full h-full border-2 rounded shadow-lg group relative flex items-center justify-center text-xs font-medium px-2 ${
                              badge.type === 'department'
                                ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
                                : 'border-blue-500 bg-blue-100 text-blue-700'
                            }`}>
                              <span className="pointer-events-none">{badge.text}</span>
                              <button
                                onClick={() => setFreeformOrgBadges(prev => prev.filter(b => b.id !== badge.id))}
                                className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer hover:bg-red-600"
                                title="Remove badge"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </Rnd>
                        ))}
                    </div>
                  );
                })}
              </Document>
            )}
          </div>
        </main>

        {/* ─── Right Sidebar ─────────────────────────────────────────── */}
        <aside className="w-80 bg-white border-l p-6 flex flex-col gap-6 overflow-y-auto shadow-lg flex-shrink-0">
          {/* ─── SECTION: Full Signature ─── */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-blue-600" />
              Your Signature
            </h3>

            {userSignature ? (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div
                  draggable
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  className="cursor-move hover:bg-gray-100 rounded border-2 border-dashed border-blue-300 p-2"
                >
                  <img src={userSignature} alt="Your signature" className="w-full h-24 object-contain pointer-events-none" />
                  <p className="text-xs text-center text-blue-600 font-medium mt-2">
                    ⬆️ Drag to document
                  </p>
                </div>
                <button
                  onClick={() => setUserSignature(null)}
                  className="mt-3 w-full text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Create New Signature
                </button>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={280}
                  height={120}
                  className="bg-white cursor-crosshair border-b touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <div className="bg-gray-50 p-3 flex gap-2">
                  <button
                    onClick={clearSignature}
                    className="flex-1 text-xs bg-white border rounded py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    onClick={saveSignature}
                    disabled={!hasDrawnSignature}
                    className="flex-1 text-xs bg-[#1a2b4a] text-white rounded py-1.5 hover:bg-[#0f1b2e] disabled:opacity-50 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── SECTION: Initial Signature ────────────────────────── */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-purple-500" />
              Your Initials
            </h3>

            {userInitialSignature ? (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div
                  draggable
                  onDragStart={handleInitialDragStart}
                  onDragEnd={handleDragEnd}
                  className="cursor-move hover:bg-gray-100 rounded border-2 border-dashed border-purple-300 p-2"
                >
                  <img src={userInitialSignature} alt="Your initials" className="w-full h-16 object-contain pointer-events-none" />
                  <p className="text-xs text-center text-purple-600 font-medium mt-2">
                    ⬆️ Drag to document
                  </p>
                </div>
                <button
                  onClick={() => setUserInitialSignature(null)}
                  className="mt-3 w-full text-sm text-purple-600 hover:text-purple-700 font-medium cursor-pointer"
                >
                  Create New Initials
                </button>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <canvas
                  ref={initialCanvasRef}
                  width={280}
                  height={80}
                  className="bg-white cursor-crosshair border-b touch-none"
                  onMouseDown={startInitialDrawing}
                  onMouseMove={drawInitial}
                  onMouseUp={stopInitialDrawing}
                  onMouseLeave={stopInitialDrawing}
                  onTouchStart={startInitialDrawing}
                  onTouchMove={drawInitial}
                  onTouchEnd={stopInitialDrawing}
                />
                <div className="bg-gray-50 p-3 flex gap-2">
                  <button
                    onClick={clearInitialSignature}
                    className="flex-1 text-xs bg-white border rounded py-1.5 hover:bg-gray-50 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    onClick={saveInitialSignature}
                    disabled={!hasDrawnInitialSignature}
                    className="flex-1 text-xs bg-[#1a2b4a] text-white rounded py-1.5 hover:bg-[#0f1b2e] disabled:opacity-50 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* ─── NEW BUTTON ───────────────────────────────────────── */}
            {freeformInitialSignatures.length > 0 && (
              <button
                onClick={applyInitialsToAllPages}
                className="mt-3 w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition"
              >
                Apply Initials to All Pages
              </button>
            )}
          </div>

          {/* ─── Signing As ─────────────────────────────────────────── */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Signing As</h3>
            <div className="space-y-3 text-sm bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                {currentUser.department && (
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggingItemType("department");
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", `department:${currentUser.department}`);
                    }}
                    onDragEnd={handleDragEnd}
                    className="cursor-move hover:bg-indigo-50 border-2 border-dashed border-indigo-300 rounded p-2"
                  >
                    <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-1 rounded inline-block pointer-events-none">
                      {currentUser.department}
                    </span>
                    <p className="text-xs text-indigo-600 font-medium mt-1">
                      ⬆️ Drag department to document
                    </p>
                  </div>
                )}
                {currentUser.division && (
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggingItemType("division");
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", `division:${currentUser.division}`);
                    }}
                    onDragEnd={handleDragEnd}
                    className="cursor-move hover:bg-blue-50 border-2 border-dashed border-blue-300 rounded p-2"
                  >
                    <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded inline-block pointer-events-none">
                      {currentUser.division}
                    </span>
                    <p className="text-xs text-blue-600 font-medium mt-1">
                      ⬆️ Drag division to document
                    </p>
                  </div>
                )}
              </div>
              <div>
                <span className="text-gray-500 text-xs">Name:</span>
                <p className="font-semibold text-gray-900">{currentUser.name}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Email:</span>
                <p className="font-medium text-gray-700">{currentUser.email}</p>
              </div>
              {currentUser.designation && (
                <div>
                  <span className="text-gray-500 text-xs">Designation:</span>
                  <p className="font-medium text-gray-700">{currentUser.designation}</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Document Info ──────────────────────────────────────── */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Document Info</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">Title:</span>
                <p className="font-medium">{meeting.title}</p>
              </div>
            </div>
          </div>

          {/* ─── Ready to Sign ─────────────────────────────────────── */}
          {(userSignature || hasDrawnSignature || userInitialSignature || hasDrawnInitialSignature) && (
            <div className="mt-auto bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-green-800">Ready to Sign</p>
                <p className="text-green-700 text-xs mt-1">
                  Click "Sign & Submit" to complete your signature
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ─── Success Modal ─────────────────────────────────────────── */}
      <SuccessModal
        isOpen={showSuccessModal}
        title="Document Signed!"
        message={signSuccessMessage}
        onClose={() => {
          setShowSuccessModal(false);
          router.push("/dashboard");
        }}
        buttonText="Back to Dashboard"
      />

      {/* ─── Validation Error Modal ────────────────────────────────── */}
      {validationError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-3">
              Cannot Sign Document
            </h3>
            <div className="text-sm text-gray-700 mb-6 whitespace-pre-line bg-red-50 border border-red-200 rounded-lg p-4">
              {validationError}
            </div>
            <button
              onClick={() => setValidationError(null)}
              className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}