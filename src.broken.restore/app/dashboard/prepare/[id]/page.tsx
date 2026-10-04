"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const PdfRenderer = dynamic(() => import("./PdfRenderer"), { ssr: false });
const PrepareThumbnails = dynamic(() => import("./PrepareThumbnails"), { ssr: false });

import { ChevronLeft, Send, Loader2 } from "lucide-react";
import SuccessModal from "@/components/SuccessModal";

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

type PageRect = { w: number; h: number };

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Color palette ─────────────────────────────────────────────────
const RECIPIENT_COLORS = [
  "#4F46E5", "#DC2626", "#16A34A", "#D97706", "#7C3AED", "#0891B2",
  "#DB2777", "#2563EB", "#65A30D", "#0D9488", "#EA580C", "#6366F1",
];

// ─── Field button definitions ──────────────────────────────────────
const FIELD_BUTTONS: { type: FieldType; label: string; icon: string }[] = [
  { type: "signature", label: "Signature", icon: "📝" },
  { type: "initial", label: "Initials", icon: "✍️" },
  { type: "name", label: "Full Name", icon: "👤" },
  { type: "date", label: "Date Signed", icon: "📅" },
];

export default function PreparePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [fields, setFields] = useState<Field[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageRects, setPageRects] = useState<Record<number, PageRect>>({});
  const [draggingFieldType, setDraggingFieldType] = useState<FieldType | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [firstRecipient, setFirstRecipient] = useState("");
  const [signingMode, setSigningMode] = useState<"sequential" | "parallel">("sequential");

  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [userInitialSignature, setUserInitialSignature] = useState<string | null>(null);

  const dragImageRef = useRef<HTMLDivElement | null>(null);

  // ─── Color map ─────────────────────────────────────────────────
  const recipientColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const participants = meeting?.participants || [];
    participants.forEach((p: any, index: number) => {
      map[p.name] = RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];
    });
    return map;
  }, [meeting?.participants]);

  // ─── Fetch meeting ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchMeeting() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          const meetingData = data.meeting || data;
          setMeeting(meetingData);
          setSigningMode(meetingData?.signingMode || "sequential");
        }
      } catch (err) {
        console.error("Error fetching meeting:", err);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchMeeting();
  }, [id]);

  // ─── Fetch fields ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchFields() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${id}/fields`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) setFields(Array.isArray(data.fields) ? data.fields : []);
      } catch (err) {
        console.error("Error fetching fields:", err);
      }
    }
    if (id) fetchFields();
  }, [id]);

  const tokenHeader = useMemo(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // ─── Load signatures ──────────────────────────────────────────
  useEffect(() => {
    async function loadUserSignature() {
      const localSig = localStorage.getItem("userSignature");
      if (localSig) setUserSignature(localSig);
      const localInit = localStorage.getItem("userInitialSignature");
      if (localInit) setUserInitialSignature(localInit);

      const token = localStorage.getItem("token");
      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.signature) {
          setUserSignature(data.signature);
          localStorage.setItem("userSignature", data.signature);
        }
        if (data.initialSignature) {
          setUserInitialSignature(data.initialSignature);
          localStorage.setItem("userInitialSignature", data.initialSignature);
        }
      }
    }
    loadUserSignature();
  }, []);

  const saveFields = async () => {
    setIsSaving(true);
    try {
      const payload = {
        fields: fields.map((f) => ({
          id: f.id,
          type: f.type,
          page: f.page,
          xPct: f.xPct,
          yPct: f.yPct,
          wPct: f.wPct,
          hPct: f.hPct,
          recipientName: f.recipientName,
        })),
      };

      const res = await fetch(`/api/meetings/${id}/fields`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(tokenHeader as Record<string, string>),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to save fields");
      }

      return true;
    } catch (e: any) {
      alert(e?.message || "Failed to save fields");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinishAndSend = async () => {
    const ok = await saveFields();
    if (!ok) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/meetings/${id}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tokenHeader as Record<string, string>),
        },
        body: JSON.stringify({ signingMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send document");
      }

      const data = await res.json();
      setFirstRecipient(data.sentTo || "the first recipient");
      setShowSuccessModal(true);
    } catch (err: any) {
      alert(err.message || "Failed to send document");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Field drag start (per-recipient) ─────────────────────────
  const handleFieldDragStart = (
    e: React.DragEvent,
    type: FieldType,
    recipientName: string,
    label: string,
    color: string
  ) => {
    setDraggingFieldType(type);

    // Payload: field:<type>:<recipientName>
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", `field:${type}:${recipientName}`);

    // Custom drag ghost: "📝 Signature — Kinga Rinzin"
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }

    const ghost = document.createElement("div");
    ghost.textContent = `${label} — ${recipientName}`;
    ghost.style.cssText = `
      padding: 6px 14px;
      background: white;
      color: #1F2937;
      border: 2px solid ${color};
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      display: inline-block;
      white-space: nowrap;
      position: fixed;
      top: -1000px;
      left: -1000px;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(ghost);
    dragImageRef.current = ghost;

    e.dataTransfer.setDragImage(ghost, 60, 15);
  };

  // ─── Recipient drag start (unchanged behavior) ────────────────
  const handleRecipientDragStart = (e: React.DragEvent, recipientName: string) => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }

    const dragImage = document.createElement("div");
    dragImage.textContent = `👤 ${recipientName}`;
    dragImage.style.cssText = `
      padding: 4px 12px;
      background: #4F46E5;
      color: white;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      display: inline-block;
      white-space: nowrap;
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(dragImage);
    dragImageRef.current = dragImage;

    e.dataTransfer.setDragImage(dragImage, 20, 12);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", `recipient:${recipientName}`);
  };

  const handleDragEnd = () => {
    setDraggingFieldType(null);
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
            Loading Document...
          </p>
        </div>
      </div>
    );
  }

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const storedName =
    meeting?.storedFileName ||
    meeting?.originalFileName ||
    meeting?.fileName ||
    "";

  const isPdf = storedName.toLowerCase().endsWith(".pdf");
  const fileUrl = id ? `/api/meetings/${id}/pdf` : "";

  const participants: Array<{ name: string; email: string }> =
    meeting?.participants || [];

  return (
    <div className="h-screen flex flex-col bg-[#f0f2f5] overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-8 py-3 flex justify-between items-center shadow-sm z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition text-gray-500 cursor-pointer"
          >
            <ChevronLeft size={22} />
          </button>
          <div>
            <h1 className="text-sm font-bold text-gray-900">
              {meeting?.title || "Untitled Document"}
            </h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                Prepare Mode
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleFinishAndSend}
            disabled={isSaving || !fileUrl}
            className="bg-[#1a2b4a] text-white px-8 py-2 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-[#0f1b2e] transition shadow-lg shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Send size={16} />
            )}
            Finish & Send
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Thumbnails */}
        <aside className="w-48 bg-white border-r p-3 overflow-y-auto z-40 shadow-sm">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Pages
          </h3>
          {numPages > 0 && (
            <PrepareThumbnails
              meetingId={id}
              numPages={numPages}
              onPageClick={(pageNumber) => {
                const pageElement = document.getElementById(
                  `pdf-page-${pageNumber}`
                );
                if (pageElement) {
                  pageElement.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }
              }}
            />
          )}
        </aside>

        {/* Center: PDF */}
        <main className="flex-1 overflow-auto p-6 flex justify-center bg-[#e2e8f0] relative">
          <div className="max-w-3xl w-full">
            {!fileUrl ? (
              <div className="bg-white p-8 rounded-xl shadow-md border border-gray-200 text-gray-600">
                No PDF filePath found for this meeting/document.
              </div>
            ) : (
              <PdfRenderer
                fileUrl={fileUrl}
                authToken={token || ""}
                isPdf={isPdf}
                fields={fields}
                setFields={setFields}
                draggingFieldType={draggingFieldType}
                userSignature={userSignature}
                userInitialSignature={userInitialSignature}
                onNumPagesChange={setNumPages}
                participants={participants}
                selectedRecipient={selectedRecipient}
                onSelectRecipient={setSelectedRecipient}
                recipientColorMap={recipientColorMap}
              />
            )}
          </div>
        </main>

        {/* Right Sidebar — per-recipient palette */}
        <aside className="w-72 bg-white border-l p-4 flex flex-col gap-4 z-40 shadow-sm overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Draggable Fields
            </h3>
            <p className="text-[10px] text-gray-400 mb-3">
              Drag a field onto the document
            </p>

            <div className="space-y-4">
              {participants.length === 0 && (
                <p className="text-xs text-gray-400 italic">
                  No participants on this document.
                </p>
              )}

              {participants.map((p, i) => {
                const color =
                  recipientColorMap[p.name] ||
                  RECIPIENT_COLORS[i % RECIPIENT_COLORS.length];
                const isSelected = selectedRecipient === p.name;

                return (
                  <div
                    key={p.email || i}
                    className="rounded-lg border-2 p-2 transition-all"
                    style={{
                      borderColor: isSelected ? color : "#E5E7EB",
                      backgroundColor: isSelected ? `${color}08` : "#FAFAFA",
                    }}
                  >
                    {/* Recipient header — clickable to highlight */}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedRecipient(isSelected ? null : p.name)
                      }
                      draggable
                      onDragStart={(e) => handleRecipientDragStart(e, p.name)}
                      onDragEnd={handleDragEnd}
                      className="w-full flex items-center gap-2 mb-2 cursor-pointer text-left"
                      title="Click to highlight their fields on the PDF • Drag to create a name field"
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {p?.name?.[0]?.toUpperCase?.() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[11px] font-bold truncate"
                          style={{ color }}
                        >
                          {p.name}
                        </p>
                        <p className="text-[9px] text-gray-500 truncate">
                          {p.email}
                        </p>
                      </div>
                      {isSelected && (
                        <span
                          className="text-[10px] font-bold"
                          style={{ color }}
                        >
                          ✓
                        </span>
                      )}
                    </button>

                    {/* Field buttons for THIS recipient */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {FIELD_BUTTONS.map((btn) => (
                        <div
                          key={btn.type}
                          draggable
                          onDragStart={(e) =>
                            handleFieldDragStart(
                              e,
                              btn.type,
                              p.name,
                              `${btn.icon} ${btn.label}`,
                              color
                            )
                          }
                          onDragEnd={handleDragEnd}
                          className="px-2 py-1.5 text-[10px] font-medium rounded border-2 bg-white cursor-move transition-all hover:shadow-sm select-none text-center"
                          style={{
                            borderColor: `${color}60`,
                            color: "#374151",
                          }}
                          title={`Drag ${btn.label} for ${p.name}`}
                        >
                          <span className="block truncate">
                            {btn.icon} {btn.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hint */}
          <div className="border-t pt-3 text-[10px] text-gray-400 space-y-1">
            <p>• Click a recipient name to highlight their fields</p>
            <p>• Drag a recipient name onto the PDF to add a name field</p>
            <p>• Drag any field button into a specific position</p>
          </div>
        </aside>
      </div>

      <SuccessModal
        isOpen={showSuccessModal}
        title="Document Sent!"
        message={`Your document has been successfully sent to ${firstRecipient}. They will receive an email notification to sign the document.`}
        onClose={() => {
          setShowSuccessModal(false);
          router.push("/dashboard");
        }}
        buttonText="Back to Dashboard"
      />
    </div>
  );
}