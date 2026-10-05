"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Loader2,
  MailCheck,
  Users,
  TrendingUp,
  Timer,
} from "lucide-react";

interface Participant {
  name: string;
  email: string;
  role: string;
  signed: boolean;
  signedAt?: string;
  isCurrent?: boolean;
  order?: number;
  lastRemindedAt?: string;
}

interface Props {
  meeting: {
    _id: string;
    title: string;
    status: string;
    sentAt?: string;
    participants: Participant[];
  };
  currentUserEmail: string | null;
  isOrganizer: boolean;
  onReminderSent?: () => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function shortDateTime(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }) + ", " + new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function SignerTrace({
  meeting,
  currentUserEmail,
  isOrganizer,
  onReminderSent,
}: Props) {
  const [reminding, setReminding] = useState(false);
  const [remindingEmail, setRemindingEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ─── Compute stats ────────────────────────────────────────
  const signers = useMemo(
    () => meeting.participants.filter((p) => p.role === "Signer" || !p.role),
    [meeting.participants]
  );
  const ccs = useMemo(
    () => meeting.participants.filter((p) => p.role && p.role !== "Signer"),
    [meeting.participants]
  );

  const signedSigners = useMemo(
    () => signers.filter((p) => p.signed),
    [signers]
  );
  const pendingSigners = useMemo(
    () => signers.filter((p) => !p.signed),
    [signers]
  );

  const signedCount = signedSigners.length;
  const totalSigners = signers.length;
  const unsignedCount = totalSigners - signedCount;
  const allSigned = totalSigners > 0 && signedCount === totalSigners;
  const progressPct = totalSigners > 0 ? (signedCount / totalSigners) * 100 : 0;

  const overdue = useMemo(() => {
    if (!meeting.sentAt) return false;
    const days =
      (Date.now() - new Date(meeting.sentAt).getTime()) /
      (1000 * 60 * 60 * 24);
    return days >= 3;
  }, [meeting.sentAt]);

  const lastActivity = useMemo(() => {
    const dates = [
      meeting.sentAt,
      ...signers.map((s) => s.signedAt),
      ...signers.map((s) => s.lastRemindedAt),
    ].filter(Boolean) as string[];
    if (dates.length === 0) return "";
    const latest = dates.sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    )[0];
    return timeAgo(latest);
  }, [meeting.sentAt, signers]);

  // ─── Send reminders ───────────────────────────────────────
  const sendReminder = async (emails?: string[]) => {
    if (emails && emails.length === 1) {
      setRemindingEmail(emails[0]);
    } else {
      setReminding(true);
    }
    setMessage("");
    setError("");

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/meetings/${meeting._id}/remind`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(emails ? { emails } : {}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send reminders");

      const sentCount = data.sent || 0;
      const skippedCount = data.skipped || 0;

      if (sentCount > 0) {
        let msg = `Reminder sent to ${sentCount} signer${
          sentCount > 1 ? "s" : ""
        }.`;
        if (skippedCount > 0) msg += ` ${skippedCount} skipped (cooldown).`;
        setMessage(msg);
      } else if (skippedCount > 0) {
        setMessage(
          `${skippedCount} signer(s) are in cooldown. Try again later.`
        );
      } else {
        setMessage("No reminders were sent.");
      }

      onReminderSent?.();
      setTimeout(() => setMessage(""), 5000);
    } catch (err: any) {
      setError(err.message || "Failed to send reminder");
      setTimeout(() => setError(""), 8000);
    } finally {
      setReminding(false);
      setRemindingEmail(null);
    }
  };

  const cooldownInfo = (p: Participant) => {
    if (!p.lastRemindedAt) return { active: false, minutesLeft: 0 };
    const elapsed = Date.now() - new Date(p.lastRemindedAt).getTime();
    const cooldownMs = 15 * 60 * 1000;
    if (elapsed >= cooldownMs) return { active: false, minutesLeft: 0 };
    return {
      active: true,
      minutesLeft: Math.ceil((cooldownMs - elapsed) / 60000),
    };
  };

  // ─── Single signer row ───────────────────────────────────
  const SignerRow = ({ p, index }: { p: Participant; index: number }) => {
    const isMe =
      currentUserEmail &&
      p.email.toLowerCase() === currentUserEmail.toLowerCase();
    const cooldown = cooldownInfo(p);
    const isOverdueRow = !p.signed && overdue;

    // Left accent color
    const accentColor = p.signed
      ? "border-l-green-500"
      : isOverdueRow
      ? "border-l-red-500"
      : p.isCurrent
      ? "border-l-amber-500"
      : "border-l-gray-300";

    // Icon
    const icon = p.signed ? (
      <CheckCircle2 size={16} className="text-green-600 shrink-0" />
    ) : isOverdueRow ? (
      <AlertCircle size={16} className="text-red-600 shrink-0" />
    ) : p.isCurrent ? (
      <Clock
        size={16}
        className="text-amber-600 shrink-0 animate-pulse"
      />
    ) : (
      <Clock size={16} className="text-gray-400 shrink-0" />
    );

    // Status badge
    const badge = p.signed ? (
      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
        Signed
      </span>
    ) : isOverdueRow ? (
      <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
        Overdue
      </span>
    ) : p.isCurrent ? (
      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
        Waiting
      </span>
    ) : (
      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap">
        Pending
      </span>
    );

    // Metadata line
    const metaParts: string[] = [p.email];
    if (p.role === "Signer" || !p.role) metaParts.push("Signer");
    if (p.signed && p.signedAt) metaParts.push(`Signed ${timeAgo(p.signedAt)}`);
    if (!p.signed && p.lastRemindedAt)
      metaParts.push(`Reminded ${timeAgo(p.lastRemindedAt)}`);
    if (!p.signed && !p.lastRemindedAt && meeting.sentAt)
      metaParts.push(`Sent ${timeAgo(meeting.sentAt)}`);
    if (!p.signed && p.isCurrent) metaParts.push("Waiting for turn");

    return (
      <div
        className={`bg-white border border-gray-200 border-l-4 ${accentColor} rounded-lg px-4 py-3 hover:shadow-sm transition group`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Icon */}
            <div className="mt-0.5">{icon}</div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {p.name}
                  {isMe && (
                    <span className="ml-1 text-indigo-600 font-normal">
                      (You)
                    </span>
                  )}
                </span>
                {badge}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                {metaParts.join(" · ")}
              </div>
            </div>
          </div>

          {/* Right side: timestamp or remind button */}
          <div className="shrink-0 flex items-center gap-2">
            {p.signed && p.signedAt && (
              <span className="text-[11px] text-gray-400 whitespace-nowrap hidden sm:inline">
                {shortDateTime(p.signedAt)}
              </span>
            )}

            {isOrganizer && !p.signed && meeting.status === "Sent" && (
              <button
                onClick={() => sendReminder([p.email])}
                disabled={cooldown.active || remindingEmail === p.email}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  cooldown.active
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white border border-red-300 text-red-600 hover:bg-red-50"
                }`}
                title={cooldown.active ? `Wait ${cooldown.minutesLeft} min` : "Send reminder"}
              >
                {remindingEmail === p.email ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : cooldown.active ? (
                  <>
                    <Timer size={11} />
                    {cooldown.minutesLeft}m
                  </>
                ) : (
                  <>
                    <Send size={11} />
                    Remind
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Progress header ─────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-br from-white to-gray-50 shrink-0">
        {/* Title row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
              Signing Progress
            </span>
          </div>
          <span className="text-xs font-bold text-gray-900">
            {Math.round(progressPct)}% complete
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allSigned ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Stat row */}
        <div className="flex items-center gap-3 text-[11px] text-gray-600 flex-wrap">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} className="text-green-600" />
            <span className="font-semibold text-gray-900">{signedCount}</span>{" "}
            signed
          </span>
          <span className="text-gray-300">·</span>
          <span className="flex items-center gap-1">
            <Clock size={11} className="text-amber-600" />
            <span className="font-semibold text-gray-900">
              {unsignedCount}
            </span>{" "}
            pending
          </span>
          {lastActivity && (
            <>
              <span className="text-gray-300">·</span>
              <span className="flex items-center gap-1">
                <TrendingUp size={11} className="text-indigo-500" />
                Last activity {lastActivity}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ─── Feedback messages ──────────────────────────────── */}
      {message && (
        <div className="px-5 py-2 bg-green-50 border-b border-green-100 text-xs text-green-800 flex items-center gap-2 shrink-0">
          <MailCheck size={12} /> {message}
        </div>
      )}
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-800 flex items-center gap-2 shrink-0">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* ─── Body ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-5 py-4 space-y-6">
        {/* ─── Pending section ─────────────────────────────── */}
        {pendingSigners.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Awaiting Signature ({pendingSigners.length})
              </h3>
              {isOrganizer && meeting.status === "Sent" && (
                <button
                  onClick={() => sendReminder()}
                  disabled={reminding}
                  className="text-[11px] font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reminding ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={11} /> Remind All
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {pendingSigners.map((p, idx) => (
                <SignerRow key={p.email || idx} p={p} index={idx} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Signed section ──────────────────────────────── */}
        {signedSigners.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-600" />
              Completed Signatures ({signedSigners.length})
            </h3>
            <div className="space-y-2">
              {signedSigners.map((p, idx) => (
                <SignerRow key={p.email || idx} p={p} index={idx} />
              ))}
            </div>
          </div>
        )}

        {/* ─── Empty state ─────────────────────────────────── */}
        {signers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Users size={32} className="mb-2" />
            <p className="text-xs">No signers on this document.</p>
          </div>
        )}

        {/* ─── CC section ──────────────────────────────────── */}
        {ccs.length > 0 && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              CC (Informed Only)
            </h3>
            <div className="space-y-2">
              {ccs.map((p, idx) => (
                <div
                  key={p.email || idx}
                  className="bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-700 truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {p.email}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 shrink-0">
                    CC
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Completion banner ───────────────────────────── */}
        {allSigned && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-800">
                All signatures collected
              </p>
              <p className="text-[10px] text-green-700 mt-0.5">
                This document is complete.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}