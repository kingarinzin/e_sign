"use client";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Rnd } from "react-rnd";
import { X, Loader2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type FieldType = "signature" | "name" | "date" | "initial";

export interface Field {
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

function PageWrapper({
  pageNumber,
  children,
  onRect,
  draggingFieldType,
  onDrop,
}: {
  pageNumber: number;
  children: React.ReactNode;
  onRect: (page: number, w: number, h: number) => void;
  draggingFieldType: FieldType | null;
  onDrop: (page: number, xPct: number, yPct: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const r = node.getBoundingClientRect();
      onRect(pageNumber, Math.round(r.width), Math.round(r.height));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [pageNumber, onRect]);

  return (
    <div
      ref={ref}
      className={`relative bg-white shadow-2xl border border-gray-300 transition-all ${
        isDragOver ? "ring-4 ring-blue-400 ring-opacity-50" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const node = ref.current;
        if (!node) return;

        const r = node.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;

        const xPct = Math.min(1, Math.max(0, x / r.width));
        const yPct = Math.min(1, Math.max(0, y / r.height));

        onDrop(pageNumber, xPct, yPct);
      }}
    >
      {children}
    </div>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export default function PdfRenderer({
  fileUrl,
  authToken,
  isPdf,
  fields,
  setFields,
  draggingFieldType,
  userSignature,
  userInitialSignature,
  userName,
  onNumPagesChange,
  participants,
  selectedRecipient,
  onSelectRecipient,
  recipientColorMap,
}: {
  fileUrl: string;
  authToken: string;
  isPdf: boolean;
  fields: Field[];
  setFields: React.Dispatch<React.SetStateAction<Field[]>>;
  draggingFieldType: FieldType | null;
  userSignature: string | null;
  userInitialSignature?: string | null;
  userName?: string;
  onNumPagesChange?: (numPages: number) => void;
  participants?: Array<{ name: string; email: string }>;
  selectedRecipient?: string | null;
  onSelectRecipient?: (name: string) => void;
  recipientColorMap?: Record<string, string>;
}) {
  const [numPages, setNumPages] = useState(0);
  const [pageRects, setPageRects] = useState<Record<number, PageRect>>({});
  const [blobUrl, setBlobUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const absoluteUrl = useMemo(() => {
    if (!fileUrl) return "";
    return fileUrl.startsWith("http")
      ? fileUrl
      : new URL(fileUrl, window.location.origin).toString();
  }, [fileUrl]);

  const handlePageRect = useCallback((page: number, w: number, h: number) => {
    setPageRects((prev) => {
      if (prev[page]?.w === w && prev[page]?.h === h) return prev;
      return { ...prev, [page]: { w, h } };
    });
  }, []);

  useEffect(() => {
    let alive = true;
    let localBlobUrl = "";

    async function run() {
      if (!absoluteUrl || !authToken) return;
      setLoading(true);
      try {
        const res = await fetch(absoluteUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
        const blob = await res.blob();
        localBlobUrl = URL.createObjectURL(blob);
        if (alive) setBlobUrl(localBlobUrl);
      } catch (e: any) {
        if (alive) setErrMsg(e?.message || "Failed to fetch PDF");
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [absoluteUrl, authToken]);

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

  const removeField = (fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
  };

  const getFieldColor = (recipientName?: string): string => {
    if (!recipientName || !recipientColorMap) return "#D1D5DB";
    return recipientColorMap[recipientName] || "#D1D5DB";
  };

  const getFieldBg = (color: string): string => {
    if (color.startsWith("#")) return `${color}20`;
    return "rgba(209, 213, 219, 0.2)";
  };

  // ─── Parse drag data ──────────────────────────────────────────
  const parseDragData = (raw: string) => {
    if (raw.startsWith("field:")) {
      const parts = raw.slice(6).split(":");
      return {
        kind: "field" as const,
        type: parts[0] as FieldType,
        recipientName: parts.slice(1).join(":"),
      };
    }
    if (raw.startsWith("recipient:")) {
      return { kind: "recipient" as const, recipientName: raw.slice(10) };
    }
    if (raw === "signature" || raw === "initial" || raw === "name" || raw === "date") {
      return { kind: "field" as const, type: raw as FieldType, recipientName: undefined };
    }
    return null;
  };

  if (!fileUrl) return <div className="p-10 text-gray-600">No file URL found.</div>;
  if (!isPdf) return <div className="p-10 text-gray-600">Prepare mode supports PDFs only.</div>;
  if (loading)
    return (
      <div className="flex items-center gap-3 p-10">
        <Loader2 className="animate-spin" /> Loading PDF...
      </div>
    );
  if (errMsg) return <div className="p-10 text-red-600">{errMsg}</div>;

  const todayDate = new Date().toLocaleDateString();

  return (
    <Document
      file={blobUrl}
      onLoadSuccess={(pdf) => {
        setNumPages(pdf.numPages);
        onNumPagesChange?.(pdf.numPages);
      }}
      loading={
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin" /> Rendering PDF...
        </div>
      }
    >
      {Array.from({ length: numPages }, (_, index) => {
        const pageNumber = index + 1;
        return (
          <div key={pageNumber} id={`pdf-page-${pageNumber}`} className="mb-6">
            <PageWrapper
              pageNumber={pageNumber}
              draggingFieldType={draggingFieldType}
              onRect={handlePageRect}
              onDrop={() => {
                /* handled by inner overlay */
              }}
            >
              <Page
                pageNumber={pageNumber}
                width={700}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(page) => {
                  setPageRects((prev) => ({
                    ...prev,
                    [pageNumber]: { w: page.width, h: page.height },
                  }));
                }}
              />

              {/* ─── Drop overlay ─────────────────────────────── */}
              <div
                className="absolute inset-0 z-5"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();

                  const dragData = e.dataTransfer.getData("text/plain");
                  const parsed = parseDragData(dragData);
                  if (!parsed) return;

                  const target = e.currentTarget as HTMLElement;
                  const rect = target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;

                  const xPct = Math.min(1, Math.max(0, x / rect.width));
                  const yPct = Math.min(1, Math.max(0, y / rect.height));

                  // ─── Recipient drag → create name field ────
                  if (parsed.kind === "recipient") {
                    const newField: Field = {
                      id: makeId(),
                      type: "name",
                      page: pageNumber,
                      xPct,
                      yPct,
                      wPct: 0.28,
                      hPct: 0.07,
                      recipientName: parsed.recipientName,
                    };
                    setFields((prev) => [...prev, newField]);
                    if (onSelectRecipient) onSelectRecipient(parsed.recipientName);
                    return;
                  }

                  // ─── Field drag ────────────────────────────
                  const recipientName =
                    parsed.recipientName ||
                    selectedRecipient ||
                    participants?.[0]?.name ||
                    "Recipient";

                  const type = parsed.type;

                  const sizeMap: Record<FieldType, { w: number; h: number }> = {
                    signature: { w: 0.28, h: 0.09 },
                    initial: { w: 0.22, h: 0.07 },
                    name: { w: 0.28, h: 0.07 },
                    date: { w: 0.22, h: 0.07 },
                  };
                  const size = sizeMap[type];

                  const newField: Field = {
                    id: makeId(),
                    type,
                    page: pageNumber,
                    xPct,
                    yPct,
                    wPct: size.w,
                    hPct: size.h,
                    recipientName,
                  };
                  setFields((prev) => [...prev, newField]);
                }}
              />

              {/* ─── Render fields ────────────────────────────── */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                {fields
                  .filter((f) => f.page === pageNumber)
                  .map((field) => {
                    const rect = pxFromPct(
                      field.page,
                      field.xPct,
                      field.yPct,
                      field.wPct,
                      field.hPct
                    );
                    const color = getFieldColor(field.recipientName);
                    const bgColor = getFieldBg(color);
                    const borderColor = color;

                    const isSignature = field.type === "signature";
                    const isInitial = field.type === "initial";
                    const isNameField = field.type === "name";
                    const isDateField = field.type === "date";

                    // Highlight when this field belongs to the selected recipient
                    const isHighlighted =
                      selectedRecipient && field.recipientName === selectedRecipient;
                    const isDimmed =
                      selectedRecipient && field.recipientName !== selectedRecipient;

                    const fieldText = isNameField
                      ? field.recipientName || "Full Name"
                      : isDateField
                      ? todayDate
                      : isInitial
                      ? field.recipientName || "Initials"
                      : field.recipientName || "Signature";

                    // ─── Signature / Initial ────────────────
                    if (isSignature || isInitial) {
                      // CRITICAL: Only show the preparer's own signature/initials
                      // preview on fields assigned to the preparer. For other
                      // recipients' fields, show an empty placeholder — the
                      // recipient will draw their own signature when signing.
                      const isMine = !!userName && field.recipientName === userName;

                      let imgSrc: string | null = null;
                      if (isMine) {
                        if (isSignature) imgSrc = userSignature || null;
                        else if (isInitial) imgSrc = userInitialSignature || null;
                      }

                      const labelText = isInitial
                        ? field.recipientName
                          ? `${field.recipientName} (initials)`
                          : "Initials"
                        : field.recipientName
                        ? `${field.recipientName} (signature)`
                        : "Signature";

                      return (
                        <Rnd
                          key={field.id}
                          size={{ width: rect.w, height: rect.h }}
                          position={{ x: rect.x, y: rect.y }}
                          bounds="parent"
                          className="pointer-events-auto"
                          onDragStop={(_e, d) => {
                            const pct = pctFromPx(
                              field.page,
                              d.x,
                              d.y,
                              rect.w,
                              rect.h
                            );
                            if (pct)
                              setFields((prev) =>
                                prev.map((f) =>
                                  f.id === field.id ? { ...f, ...pct } : f
                                )
                              );
                          }}
                          onResizeStop={(_e, _dir, ref, _delta, position) => {
                            const pct = pctFromPx(
                              field.page,
                              position.x,
                              position.y,
                              ref.offsetWidth,
                              ref.offsetHeight
                            );
                            if (pct)
                              setFields((prev) =>
                                prev.map((f) =>
                                  f.id === field.id ? { ...f, ...pct } : f
                                )
                              );
                          }}
                        >
                          <div
                            className={`w-full h-full group relative flex items-center justify-center rounded transition-all bg-white/50 ${
                              isHighlighted ? "ring-2 ring-offset-1" : ""
                            } ${isDimmed ? "opacity-60" : "opacity-100"}`}
                            style={{
                              borderColor: borderColor,
                              backgroundColor: bgColor,
                              borderStyle: imgSrc ? "solid" : "dashed",
                              borderWidth: 2,
                              ...(isHighlighted
                                ? { boxShadow: `0 0 0 3px ${color}50` }
                                : {}),
                            }}
                          >
                            {imgSrc ? (
                              <img
                                src={imgSrc}
                                alt={isInitial ? "initials" : "signature"}
                                className="w-full h-full object-contain select-none"
                                draggable={false}
                              />
                            ) : (
                              <span
                                className="font-medium select-none text-center px-1 truncate"
                                style={{
                                  fontSize: `calc(${rect.h}px * 0.30)`,
                                  color: color === "#D1D5DB" ? "#6B7280" : color,
                                }}
                              >
                                {labelText}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeField(field.id);
                              }}
                              className="absolute -top-2 -right-2 bg-white text-gray-400 hover:text-red-500 rounded-full shadow-md border p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </Rnd>
                      );
                    }

                    // ─── Name & Date ────────────────────────
                    return (
                      <Rnd
                        key={field.id}
                        size={{ width: rect.w, height: rect.h }}
                        position={{ x: rect.x, y: rect.y }}
                        bounds="parent"
                        className="pointer-events-auto"
                        onDragStop={(_e, d) => {
                          const pct = pctFromPx(field.page, d.x, d.y, rect.w, rect.h);
                          if (pct)
                            setFields((prev) =>
                              prev.map((f) =>
                                f.id === field.id ? { ...f, ...pct } : f
                              )
                            );
                        }}
                        onResizeStop={(_e, _dir, ref, _delta, position) => {
                          const pct = pctFromPx(
                            field.page,
                            position.x,
                            position.y,
                            ref.offsetWidth,
                            ref.offsetHeight
                          );
                          if (pct)
                            setFields((prev) =>
                              prev.map((f) =>
                                f.id === field.id ? { ...f, ...pct } : f
                              )
                            );
                        }}
                      >
                        <div
                          className={`w-full h-full group relative flex items-center justify-center border-2 rounded transition-all bg-white/50 ${
                            isHighlighted ? "ring-2 ring-offset-1" : ""
                          } ${isDimmed ? "opacity-60" : "opacity-100"}`}
                          style={{
                            borderColor: borderColor,
                            backgroundColor: bgColor,
                            ...(isHighlighted
                              ? { boxShadow: `0 0 0 3px ${color}50` }
                              : {}),
                          }}
                        >
                          <div className="w-full h-full flex items-center justify-center px-2">
                            {editingFieldId === field.id ? (
                              <input
                                type="text"
                                value={editingLabel}
                                onChange={(e) =>
                                  setEditingLabel(e.target.value)
                                }
                                onBlur={() => {
                                  setFields((prev) =>
                                    prev.map((f) =>
                                      f.id === field.id
                                        ? {
                                            ...f,
                                            recipientName:
                                              editingLabel || f.recipientName,
                                          }
                                        : f
                                    )
                                  );
                                  setEditingFieldId(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    setFields((prev) =>
                                      prev.map((f) =>
                                        f.id === field.id
                                          ? {
                                              ...f,
                                              recipientName:
                                                editingLabel ||
                                                f.recipientName,
                                            }
                                          : f
                                      )
                                    );
                                    setEditingFieldId(null);
                                  }
                                }}
                                autoFocus
                                className="w-full h-full text-center bg-white border-2 border-blue-500 rounded px-2 text-gray-900 font-medium outline-none"
                                style={{
                                  fontSize: `calc(${rect.h}px * 0.35)`,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span
                                className="font-medium whitespace-nowrap overflow-hidden select-none cursor-pointer"
                                style={{
                                  fontSize: `calc(${rect.h}px * 0.35)`,
                                  color:
                                    color === "#D1D5DB" ? "#374151" : color,
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingFieldId(field.id);
                                  setEditingLabel(
                                    field.recipientName || fieldText
                                  );
                                }}
                                title="Double-click to edit recipient name"
                              >
                                {fieldText}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(field.id);
                            }}
                            className="absolute -top-2 -right-2 bg-white text-gray-400 hover:text-red-500 rounded-full shadow-md border p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </Rnd>
                    );
                  })}
              </div>
            </PageWrapper>
          </div>
        );
      })}
    </Document>
  );
}