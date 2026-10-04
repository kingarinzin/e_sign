"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Loader2,
  Send,
  PenTool,
  CheckCircle2,
  AlertCircle,
  Layers,
} from "lucide-react";
import SuccessModal from "@/components/SuccessModal";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ─── Color palette — must match Prepare page ─────────────────────
const RECIPIENT_COLORS = [
  "#4F46E5", "#DC2626", "#16A34A", "#D97706", "#7C3AED", "#0891B2",
  "#DB2777", "#2563EB", "#65A30D", "#0D9488", "#EA580C", "#6366F1",
];

type FieldType = "signature" | "name" | "date" | "initial";

interface Field {
  id: string;
  type: FieldType;
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  recipientName?: string;
}

interface AutoInitial {
  id: string;
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function SigningView({
  meeting,
  meetingId,
  currentUser,
  signingToken,
}: {
  meeting: any;
  meetingId: string;
  currentUser: any;
  signingToken?: string | null;
}) {
  const router = useRouter();

  const [numPages, setNumPages] = useState(0);
  const [blobUrl, setBlobUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);

  // Auth token resolution
  const getAuthToken = () =>
    signingToken || localStorage.getItem("token");

  // Full signature
  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Initial signature
  const [userInitialSignature, setUserInitialSignature] = useState<string | null>(null);
  const [hasDrawnInitialSignature, setHasDrawnInitialSignature] = useState(false);
  const initialCanvasRef = useRef<HTMLCanvasElement>(null);

  // UI state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [signSuccessMessage, setSignSuccessMessage] = useState("");
  const [signatureError, setSignatureError] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Filled placeholder IDs (from meeting.fields)
  const [filledIds, setFilledIds] = useState<Set<string>>(new Set());

  // Auto-applied initials (Option B) — one per page where signer clicked "Apply to All"
  const [autoInitials, setAutoInitials] = useState<AutoInitial[]>([]);

  // ─── Derived: does the meeting have signing placeholders? ─────
  const hasSigningFields = useMemo(() => {
    return (
      Array.isArray(meeting?.fields) &&
      meeting.fields.some(
        (f: Field) => f.type === "signature" || f.type === "initial"
      )
    );
  }, [meeting?.fields]);

  // ─── Recipient color map (matches prepare page) ───────────────
  const recipientColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const participants = meeting?.participants || [];
    participants.forEach((p: any, index: number) => {
      map[p.name] = RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];
    });
    return map;
  }, [meeting?.participants]);

  // ─── My participant record ────────────────────────────────────
  const myParticipant = useMemo(() => {
    if (!currentUser?.email || !meeting?.participants) return null;
    return meeting.participants.find(
      (p: any) => p.email?.toLowerCase() === currentUser.email.toLowerCase()
    );
  }, [meeting?.participants, currentUser?.email]);

  const myColor = myParticipant
    ? recipientColorMap[myParticipant.name] || "#4F46E5"
    : "#4F46E5";

  // ─── My fields + signable fields ──────────────────────────────
  const myFields = useMemo(() => {
    if (!myParticipant || !Array.isArray(meeting?.fields)) return [];
    return meeting.fields.filter(
      (f: Field) => f.recipientName === myParticipant.name
    );
  }, [meeting?.fields, myParticipant]);

  const mySignableFields = useMemo(
    () =>
      myFields.filter(
        (f: Field) => f.type === "signature" || f.type === "initial"
      ),
    [myFields]
  );

  // ─── Progress ─────────────────────────────────────────────────
  const filledSignableCount = useMemo(
    () => mySignableFields.filter((f: Field) => filledIds.has(f.id)).length,
    [mySignableFields, filledIds]
  );

  const totalToFill = mySignableFields.length;

  const allFilled =
    totalToFill > 0 && filledSignableCount === totalToFill;

  // ─── Did the signer fill at least one initials placeholder? ───
  const hasFilledInitials = useMemo(
    () =>
      myFields.some(
        (f: Field) => f.type === "initial" && filledIds.has(f.id)
      ),
    [myFields, filledIds]
  );

  // ─── Fetch PDF ─────────────────────────────────────────────────
  useEffect(() => {
    async function fetchPdf() {
      try {
        const token = getAuthToken();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // ─── Load saved signatures (internal users only) ──────────────
  useEffect(() => {
    async function loadSignatures() {
      if (currentUser?.isExternal) return;
      const token = getAuthToken();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.isExternal]);

  // ─── Drawing functions (signature) ────────────────────────────
  const startDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawnSignature(true);
  };

  const stopDrawing = () => setIsDrawing(false);

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

    if (currentUser?.isExternal) return;

    const token = getAuthToken();
    await fetch("/api/user/update-signature", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ signature: dataUrl }),
    });
  };

  // ─── Drawing functions (initials) ─────────────────────────────
  const startInitialDrawing = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    e.preventDefault();
    const canvas = initialCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const drawInitial = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = initialCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasDrawnInitialSignature(true);
  };

  const stopInitialDrawing = () => setIsDrawing(false);

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

    if (currentUser?.isExternal) return;

    const token = getAuthToken();
    await fetch("/api/user/update-signature", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ initialSignature: dataUrl }),
    });
  };

  // ─── Placeholder click handler ────────────────────────────────
  const handlePlaceholderClick = (field: Field) => {
    if (!myParticipant) return;

    const isFilled = filledIds.has(field.id);

    // Click on filled → undo
    if (isFilled) {
      if (!confirm("Remove from this placeholder?")) return;
      setFilledIds((prev) => {
        const next = new Set(prev);
        next.delete(field.id);
        return next;
      });
      return;
    }

    // Fill signature placeholder
    if (field.type === "signature") {
      const sig =
        userSignature ||
        (hasDrawnSignature ? canvasRef.current?.toDataURL("image/png") : null);

      if (!sig) {
        setSignatureError("Please draw your signature in the sidebar first.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (hasDrawnSignature && !userSignature) saveSignature();

      setFilledIds((prev) => {
        const next = new Set(prev);
        next.add(field.id);
        // Auto-fill name + date on the same page
        myFields
          .filter(
            (f: Field) =>
              (f.type === "name" || f.type === "date") &&
              f.page === field.page
          )
          .forEach((f: Field) => next.add(f.id));
        return next;
      });
      setSignatureError("");
    } else if (field.type === "initial") {
      const init =
        userInitialSignature ||
        (hasDrawnInitialSignature
          ? initialCanvasRef.current?.toDataURL("image/png")
          : null);

      if (!init) {
        setSignatureError("Please draw your initials in the sidebar first.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (hasDrawnInitialSignature && !userInitialSignature) saveInitialSignature();

      setFilledIds((prev) => {
        const next = new Set(prev);
        next.add(field.id);
        return next;
      });
      setSignatureError("");
    } else if (field.type === "name" || field.type === "date") {
      setFilledIds((prev) => {
        const next = new Set(prev);
        next.add(field.id);
        return next;
      });
    }
  };

  // ─── Apply initials to all pages (Option B) ───────────────────
  const applyInitialsToAllPages = () => {
    // Find a filled initials placeholder to use as template
    const filledInitial = myFields.find(
      (f: Field) => f.type === "initial" && filledIds.has(f.id)
    );

    if (!filledInitial) {
      alert("Please fill your initials placeholder first.");
      return;
    }

    if (!userInitialSignature && !hasDrawnInitialSignature) {
      alert("Please draw your initials first.");
      return;
    }

    // Build list of pages that already have initials
    const pagesWithInitials = new Set<number>([
      ...myFields
        .filter((f: Field) => f.type === "initial" && filledIds.has(f.id))
        .map((f: Field) => f.page),
      ...autoInitials.map((a) => a.page),
    ]);

    const newEntries: AutoInitial[] = [];
    for (let page = 1; page <= numPages; page++) {
      if (!pagesWithInitials.has(page)) {
        newEntries.push({
          id: makeId(),
          page,
          xPct: filledInitial.xPct,
          yPct: filledInitial.yPct,
          wPct: filledInitial.wPct,
          hPct: filledInitial.hPct,
        });
      }
    }

    if (newEntries.length === 0) {
      alert("Initials are already applied to all pages.");
      return;
    }

    if (!confirm(`Apply initials to ${newEntries.length} more page(s)?`)) return;

    if (hasDrawnInitialSignature && !userInitialSignature) {
      saveInitialSignature();
    }

    setAutoInitials((prev) => [...prev, ...newEntries]);
  };

  // ─── Remove an auto-applied initials ──────────────────────────
  const removeAutoInitial = (id: string) => {
    setAutoInitials((prev) => prev.filter((a) => a.id !== id));
  };

  // ─── Handle sign submission ───────────────────────────────────
  const handleSign = async () => {
    setSignatureError("");
    setValidationError(null);

    if (hasSigningFields) {
      // Validate all signable placeholders are filled
      const unfilled = mySignableFields.filter((f: Field) => !filledIds.has(f.id));

      if (unfilled.length > 0) {
        setValidationError(
          `Please fill all your placeholders before signing.\n\nMissing:\n${unfilled
            .map(
              (f: Field) =>
                `• Page ${f.page}: ${
                  f.type === "signature" ? "Signature" : "Initials"
                }`
            )
            .join("\n")}`
        );
        setSignatureError("Please fill all your placeholders before signing");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // Build signature + initials positions
      const PAGE_W = 700;
      const PAGE_H = 900;

      const signaturePositions = myFields
        .filter((f: Field) => f.type === "signature" && filledIds.has(f.id))
        .map((f: Field) => ({
          id: f.id,
          page: f.page,
          x: f.xPct * PAGE_W,
          y: f.yPct * PAGE_H,
          width: f.wPct * PAGE_W,
          height: f.hPct * PAGE_H,
        }));

      const initialSignaturePositions = [
        ...myFields
          .filter((f: Field) => f.type === "initial" && filledIds.has(f.id))
          .map((f: Field) => ({
            id: f.id,
            page: f.page,
            x: f.xPct * PAGE_W,
            y: f.yPct * PAGE_H,
            width: f.wPct * PAGE_W,
            height: f.hPct * PAGE_H,
          })),
        ...autoInitials.map((a) => ({
          id: a.id,
          page: a.page,
          x: a.xPct * PAGE_W,
          y: a.yPct * PAGE_H,
          width: a.wPct * PAGE_W,
          height: a.hPct * PAGE_H,
        })),
      ];

      const finalFullSignature =
        userSignature ||
        (hasDrawnSignature ? canvasRef.current?.toDataURL("image/png") : null);
      const finalInitialSignature =
        userInitialSignature ||
        (hasDrawnInitialSignature
          ? initialCanvasRef.current?.toDataURL("image/png")
          : null);

      setSigning(true);
      try {
        const token = getAuthToken();
        const res = await fetch(`/api/meetings/${meetingId}/sign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            signature: finalFullSignature,
            signaturePositions,
            initialSignature: finalInitialSignature,
            initialSignaturePositions,
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
      return;
    }

    // No placeholders → block
    setValidationError(
      "This document has no signature placeholders. Please contact the organizer."
    );
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────
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
            disabled={signing}
            className="bg-[#1a2b4a] text-white px-6 py-2 rounded-lg font-semibold hover:bg-[#0f1b2e] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
          >
            {signing ? (
              <>
                <Loader2 className="animate-spin" size={16} /> Signing...
              </>
            ) : (
              <>
                <Send size={16} /> Sign & Submit
              </>
            )}
          </button>
        </div>
      </header>

      {/* Error banner */}
      {signatureError && (
        <div className="bg-red-50 border-l-4 border-red-500 px-8 py-3 z-40">
          <div className="max-w-6xl mx-auto flex items-center gap-2">
            <AlertCircle size={18} className="text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-800">{signatureError}</p>
            <button
              onClick={() => setSignatureError("")}
              className="ml-auto text-red-500 hover:text-red-700 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: thumbnails */}
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
                      document
                        .getElementById(`pdf-page-${i + 1}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            <div className="text-[10px] text-gray-400 text-center py-4">
              Loading...
            </div>
          )}
        </aside>

        {/* Center: PDF */}
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
                  const pageFields = Array.isArray(meeting.fields)
                    ? meeting.fields.filter((f: Field) => f.page === pageNum)
                    : [];
                  const pageAutoInitials = autoInitials.filter(
                    (a) => a.page === pageNum
                  );

                  return (
                    <div
                      key={pageNum}
                      id={`pdf-page-${pageNum}`}
                      className="mb-6 shadow-xl relative"
                      data-page-number={pageNum}
                    >
                      <Page
                        pageNumber={pageNum}
                        width={700}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />

                      {/* Placeholders */}
                      {pageFields.map((field: Field) => {
                        const isMine =
                          field.recipientName === myParticipant?.name;
                        const isFilled = filledIds.has(field.id);
                        const ownerColor =
                          recipientColorMap[field.recipientName || ""] ||
                          "#6B7280";

                        return (
                          <div
                            key={field.id}
                            onClick={() =>
                              isMine && handlePlaceholderClick(field)
                            }
                            className={`absolute border-2 rounded transition-all ${
                              isFilled
                                ? "border-green-500 bg-white"
                                : isMine
                                ? "cursor-pointer shadow-lg"
                                : "border-dashed border-gray-300 bg-gray-50/50"
                            }`}
                            style={{
                              left: `${field.xPct * 100}%`,
                              top: `${field.yPct * 100}%`,
                              width: `${field.wPct * 100}%`,
                              height: `${field.hPct * 100}%`,
                              borderColor: isFilled
                                ? "#10B981"
                                : isMine
                                ? ownerColor
                                : "#D1D5DB",
                              backgroundColor: isFilled
                                ? "white"
                                : isMine
                                ? `${ownerColor}10`
                                : "rgba(243, 244, 246, 0.3)",
                              animation:
                                isMine && !isFilled
                                  ? "pulse-border 2s ease-in-out infinite"
                                  : "none",
                            }}
                          >
                            {isFilled ? (
                              <>
                                {field.type === "signature" &&
                                  userSignature && (
                                    <img
                                      src={userSignature}
                                      alt="signature"
                                      className="w-full h-full object-contain p-1"
                                    />
                                  )}
                                {field.type === "initial" &&
                                  userInitialSignature && (
                                    <img
                                      src={userInitialSignature}
                                      alt="initials"
                                      className="w-full h-full object-contain p-1"
                                    />
                                  )}
                                {field.type === "name" && (
                                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-gray-800">
                                    {myParticipant?.name ||
                                      currentUser?.name ||
                                      ""}
                                  </div>
                                )}
                                {field.type === "date" && (
                                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-700">
                                    {new Date().toLocaleDateString()}
                                  </div>
                                )}
                                <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
                                  ✓
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-center px-1">
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wider"
                                  style={{
                                    color: isMine ? ownerColor : "#9CA3AF",
                                  }}
                                >
                                  {field.type === "signature" && "✍ Sign Here"}
                                  {field.type === "initial" && "Initial Here"}
                                  {field.type === "name" && "👤 Full Name"}
                                  {field.type === "date" && "📅 Date"}
                                </span>
                                {field.recipientName && (
                                  <span
                                    className="text-[9px] mt-0.5 truncate max-w-full"
                                    style={{
                                      color: isMine ? ownerColor : "#9CA3AF",
                                    }}
                                  >
                                    {isMine
                                      ? "Your signature"
                                      : `Reserved: ${field.recipientName}`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Auto-applied initials (Option B) */}
                      {pageAutoInitials.map((a) => (
                        <div
                          key={a.id}
                          onClick={() => {
                            if (
                              confirm(
                                "Remove initials from this page?"
                              )
                            ) {
                              removeAutoInitial(a.id);
                            }
                          }}
                          className="absolute border-2 border-purple-500 rounded bg-white cursor-pointer shadow-sm hover:shadow-md transition group"
                          style={{
                            left: `${a.xPct * 100}%`,
                            top: `${a.yPct * 100}%`,
                            width: `${a.wPct * 100}%`,
                            height: `${a.hPct * 100}%`,
                          }}
                          title="Click to remove initials from this page"
                        >
                          {userInitialSignature && (
                            <img
                              src={userInitialSignature}
                              alt="initials"
                              className="w-full h-full object-contain p-1"
                            />
                          )}
                          <div className="absolute -top-1 -right-1 bg-purple-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition">
                            ✕
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </Document>
            )}
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-80 bg-white border-l p-6 flex flex-col gap-6 overflow-y-auto shadow-lg flex-shrink-0">
          {/* Full signature */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-blue-600" />
              Your Signature
            </h3>

            {userSignature ? (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="border-2 border-dashed border-blue-300 rounded p-2">
                  <img
                    src={userSignature}
                    alt="Your signature"
                    className="w-full h-24 object-contain"
                  />
                </div>
                <p className="text-xs text-center text-blue-600 font-medium mt-2">
                  {hasSigningFields
                    ? "Click a placeholder on the document to place"
                    : "Ready to use"}
                </p>
                <button
                  onClick={() => {
                    setUserSignature(null);
                    setHasDrawnSignature(false);
                  }}
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

          {/* Initials */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-purple-500" />
              Your Initials
            </h3>

            {userInitialSignature ? (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="border-2 border-dashed border-purple-300 rounded p-2">
                  <img
                    src={userInitialSignature}
                    alt="Your initials"
                    className="w-full h-16 object-contain"
                  />
                </div>
                <p className="text-xs text-center text-purple-600 font-medium mt-2">
                  {hasSigningFields
                    ? "Click a placeholder on the document to place"
                    : "Ready to use"}
                </p>
                <button
                  onClick={() => {
                    setUserInitialSignature(null);
                    setHasDrawnInitialSignature(false);
                  }}
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

            {/* ── Apply Initials to All Pages ── */}
            {hasFilledInitials && numPages > 1 && (
              <button
                onClick={applyInitialsToAllPages}
                className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Layers size={16} />
                Apply Initials to All {numPages} Pages
              </button>
            )}

            {/* Show count if some are already applied */}
            {autoInitials.length > 0 && (
              <p className="mt-2 text-[11px] text-purple-700 bg-purple-50 rounded p-2 text-center">
                Initials applied to {autoInitials.length + (hasFilledInitials ? 1 : 0)}{" "}
                page(s). Click any initials to remove.
              </p>
            )}
          </div>

          {/* Progress */}
          {hasSigningFields && mySignableFields.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Progress</h3>
              <div className="space-y-2">
                <div className="text-xs text-gray-600">
                  {filledSignableCount} of {totalToFill} filled
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      allFilled ? "bg-green-500" : "bg-amber-500"
                    }`}
                    style={{
                      width: `${
                        totalToFill > 0
                          ? (filledSignableCount / totalToFill) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {allFilled && (
                  <p className="text-xs text-green-700 font-medium">
                    ✓ All required fields filled
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Signing As */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Signing As</h3>
            <div className="space-y-3 text-sm bg-gray-50 rounded-lg p-4">
              <div>
                <span className="text-gray-500 text-xs">Name:</span>
                <p className="font-semibold text-gray-900">
                  {currentUser.name}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Email:</span>
                <p className="font-medium text-gray-700">
                  {currentUser.email}
                </p>
              </div>
              {currentUser.isExternal && (
                <div className="text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold inline-block">
                  External Signer
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Pulse animation */}
      <style jsx global>{`
        @keyframes pulse-border {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
      `}</style>

      <SuccessModal
        isOpen={showSuccessModal}
        title="Document Signed!"
        message={signSuccessMessage}
        onClose={() => {
          setShowSuccessModal(false);
          if (currentUser?.isExternal) {
            document.body.innerHTML =
              '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial;color:#374151;"><div style="text-align:center;max-width:480px;padding:24px;"><h1 style="color:#10B981;font-size:28px;margin-bottom:12px;">Thank You for Signing</h1><p style="font-size:16px;line-height:1.6;">Your signature has been recorded successfully.</p><p style="font-size:14px;line-height:1.6;color:#6B7280;margin-top:16px;">Once all signers have completed, the signed document will be sent to your email address.</p><p style="font-size:14px;color:#9CA3AF;margin-top:24px;">You may now close this window.</p></div></div>';
          } else {
            router.push("/dashboard");
          }
        }}
        buttonText={currentUser?.isExternal ? "Done" : "Back to Dashboard"}
      />

      {validationError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
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