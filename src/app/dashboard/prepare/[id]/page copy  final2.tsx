"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const PdfRenderer = dynamic(() => import("./PdfRenderer"), { ssr: false });
const PrepareThumbnails = dynamic(() => import("./PrepareThumbnails"), { ssr: false });

import {
  Type,
  PenTool,
  Calendar,
  ChevronLeft,
  Send,
  Loader2,
  X,
  MousePointer2,
} from "lucide-react";
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

// ─── Color palette for recipients ─────────────────────────────────
const RECIPIENT_COLORS = [
  '#4F46E5', // Indigo
  '#DC2626', // Red
  '#16A34A', // Green
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#0891B2', // Cyan
  '#DB2777', // Pink
  '#2563EB', // Blue
  '#65A30D', // Lime
  '#0D9488', // Teal
  '#EA580C', // Orange
  '#6366F1', // Indigo Light
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
  const [placingType, setPlacingType] = useState<FieldType | null>(null);
  const [draggingFieldType, setDraggingFieldType] = useState<FieldType | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [firstRecipient, setFirstRecipient] = useState("");
  const [signingMode, setSigningMode] = useState<"sequential" | "parallel">("sequential");

  // ─── State for both signatures ──────────────────────────────────
  const [userSignature, setUserSignature] = useState<string | null>(null);
  const [userInitialSignature, setUserInitialSignature] = useState<string | null>(null);

  // ─── Generate a map from recipient name to color ──────────────
  const recipientColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const participants = meeting?.participants || [];
    participants.forEach((p: any, index: number) => {
      const color = RECIPIENT_COLORS[index % RECIPIENT_COLORS.length];
      map[p.name] = color;
    });
    return map;
  }, [meeting?.participants]);

  // ─── Fetch meeting ──────────────────────────────────────────────
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
          if (meetingData?.participants?.length > 0 && !selectedRecipient) {
            setSelectedRecipient(meetingData.participants[0].name);
          }
        }
      } catch (err) {
        console.error("Error fetching meeting:", err);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchMeeting();
  }, [id]);

  // ─── Fetch fields ───────────────────────────────────────────────
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

  // ─── Load both full and initial signatures ─────────────────────
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacingType(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const removeField = (fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  };

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const pxFromPct = (
    page: number,
    xPct: number,
    yPct: number,
    wPct: number,
    hPct: number
  ) => {
    const rect = pageRects[page];
    if (!rect) return { x: 0, y: 0, w: 160, h: 48 };
    return {
      x: xPct * rect.w,
      y: yPct * rect.h,
      w: Math.max(80, wPct * rect.w),
      h: Math.max(36, hPct * rect.h),
    };
  };

  const pctFromPx = (
    page: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const rect = pageRects[page];
    if (!rect) return null;
    return {
      xPct: clamp01(x / rect.w),
      yPct: clamp01(y / rect.h),
      wPct: clamp01(w / rect.w),
      hPct: clamp01(h / rect.h),
    };
  };

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

  // ─── Get selected recipient's color for styling ──────────────
  const selectedColor = selectedRecipient ? recipientColorMap[selectedRecipient] : null;

  return (
    <div className="h-screen flex flex-col bg-[#f0f2f5] overflow-hidden">
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
        <aside className="w-48 bg-white border-r p-3 overflow-y-auto z-40 shadow-sm">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
            Pages
          </h3>
          {numPages > 0 && (
            <PrepareThumbnails
              meetingId={id}
              numPages={numPages}
              onPageClick={(pageNumber) => {
                const pageElement = document.getElementById(`pdf-page-${pageNumber}`);
                if (pageElement) {
                  pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
            />
          )}
        </aside>

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
                participants={meeting?.participants}
                selectedRecipient={selectedRecipient}
                onSelectRecipient={setSelectedRecipient}
                recipientColorMap={recipientColorMap}
              />
            )}
          </div>
        </main>

        <aside className="w-64 bg-white border-l p-4 flex flex-col gap-4 z-40 shadow-sm overflow-y-auto">
          <div>
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Draggable Fields
            </h3>
            <div className="flex flex-col space-y-2">
              <div
                draggable
                onDragStart={(e) => {
                  setDraggingFieldType("signature");
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setDraggingFieldType(null)}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 transition-all cursor-move shadow-sm"
              >
                📝 Signature
              </div>
              <div
                draggable
                onDragStart={(e) => {
                  setDraggingFieldType("initial");
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setDraggingFieldType(null)}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 transition-all cursor-move shadow-sm"
              >
                ✍️ Initials
              </div>
              <div
                draggable
                onDragStart={(e) => {
                  setDraggingFieldType("name");
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setDraggingFieldType(null)}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 transition-all cursor-move shadow-sm"
              >
                👤 Full Name
              </div>
              <div
                draggable
                onDragStart={(e) => {
                  setDraggingFieldType("date");
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={() => setDraggingFieldType(null)}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 hover:border-blue-500 hover:text-blue-600 transition-all cursor-move shadow-sm"
              >
                📅 Date Signed
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-3">
              Recipients (Click to Select)
            </p>
            <div className="space-y-2">
              {meeting?.participants?.map((p: any, i: number) => {
                const color = recipientColorMap[p.name] || '#6B7280';
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedRecipient(p.name)}
                    className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedRecipient === p.name
                        ? 'bg-white'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                    }`}
                    style={{
                      borderColor: selectedRecipient === p.name ? color : undefined,
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm text-white"
                      style={{ backgroundColor: color }}
                    >
                      {p?.name?.[0]?.toUpperCase?.() || "?"}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="text-[10px] font-bold text-gray-800 truncate">
                        {p.name}
                      </p>
                      <p className="text-[9px] text-gray-500 truncate">
                        {p.email}
                      </p>
                    </div>
                    {selectedRecipient === p.name && (
                      <div className="text-xs" style={{ color }}>✓</div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedRecipient && (
              <p
                className="text-[9px] font-semibold mt-2 text-center"
                style={{ color: selectedColor || '#2563EB' }}
              >
                Fields will be assigned to {selectedRecipient}
              </p>
            )}
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