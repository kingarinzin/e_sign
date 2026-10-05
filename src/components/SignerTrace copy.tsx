"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Loader2,
  MailCheck,
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

function isOverdue(meeting: { sentAt?: string }): boolean {
  if (!meeting.sentAt) return false;
  const daysSinceSent =
    (Date.now() - new Date(meeting.sentAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceSent >= 3;
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
    () => meeting.participants.filter((p) => p.role === "Signer"),
    [meeting.participants]
  );
  const ccs = useMemo(
    () => meeting.participants.filter((p) => p.role !== "Signer"),
    [meeting.participants]
  );

  const signedCount = signers.filter((p) => p.signed).length;
  const totalSigners = signers.length;
  const unsignedCount = totalSigners - signedCount;
  const allSigned = totalSigners > 0 && signedCount === totalSigners;
  const progressPct = totalSigners > 0 ? (signedCount / totalSigners) * 100 : 0;
  const overdue = isOverdue(meeting);

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

      if (!res.ok) {
        throw new Error(data.error || "Failed to send reminders");
      }

      const sentCount = data.sent || 0;
      const skippedCount = data.skipped || 0;

      if (sentCount > 0) {
        let msg = `Reminder sent to ${sentCount} signer${
          sentCount > 1 ? "s" : ""
        }.`;
        if (skippedCount > 0) {
          msg += ` ${skippedCount} skipped (cooldown).`;
        }
        setMessage(msg);
      } else if (skippedCount > 0) {
        setMessage(`${skippedCount} signer(s) are in cooldown. Try again later.`);
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

  // ─── Cooldown check for a participant ─────────────────────
  const cooldownInfo = (p: Participant) => {
    if (!p.lastRemindedAt) return { active: false, minutesLeft: 0 };
    const elapsed =
      Date.now() - new Date(p.lastRemindedAt).getTime();
    const cooldownMs = 15 * 60 * 1000;
    if (elapsed >= cooldownMs) return { active: false, minutesLeft: 0 };
    return {
      active: true,
      minutesLeft: Math.ceil((cooldownMs - elapsed) / 60000),
    };
  };

  // ─── Row status pill ──────────────────────────────────────
  const statusPill = (p: Participant) => {
    if (p.signed) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
          <CheckCircle2 size={10} /> Signed
        </span>
      );
    }
    if (p.isCurrent) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
          <Clock size={10} /> Waiting
        </span>
      );
    }
    if (overdue) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
          <AlertCircle size={10} /> Overdue
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
        <Clock size={10} /> Pending
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* ─── Progress header ─────────────────────────────── */}
      <div className="px-5 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">
            Signing progress
          </span>
          <span className="text-xs font-bold text-gray-900">
            {signedCount} of {totalSigners} signed
          </span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              allSigned ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {allSigned && (
          <p className="text-[11px] text-green-700 font-medium mt-2 flex items-center gap-1">
            <CheckCircle2 size={12} /> All signatures collected
          </p>
        )}

        {isOrganizer && !allSigned && meeting.status === "Sent" && (
          <button
            onClick={() => sendReminder()}
            disabled={reminding}
            className="mt-3 w-full bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-2 rounded-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {reminding ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Sending...
              </>
            ) : (
              <>
                <Send size={12} /> Send Reminder to All ({unsignedCount})
              </>
            )}
          </button>
        )}
      </div>

      {/* ─── Feedback message ──────────────────────────────── */}
      {message && (
        <div className="px-5 py-2 bg-green-50 border-b border-green-100 text-xs text-green-800 flex items-center gap-2">
          <MailCheck size={12} /> {message}
        </div>
      )}
      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-800 flex items-center gap-2">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      {/* ─── Signers list ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {signers.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">
            No signers on this document.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {signers.map((p, idx) => {
              const isMe =
                currentUserEmail &&
                p.email.toLowerCase() === currentUserEmail.toLowerCase();
              const cooldown = cooldownInfo(p);
              const showRemindButton =
                isOrganizer && !p.signed && meeting.status === "Sent";

              return (
                <div
                  key={p.email || idx}
                  className={`px-5 py-3 hover:bg-gray-50/60 transition ${
                    isMe ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: name + email */}
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
                        {statusPill(p)}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate mt-0.5">
                        {p.email}
                      </div>

                      {/* Signed timestamp */}
                      {p.signed && p.signedAt && (
                        <div className="text-[10px] text-green-700 mt-1">
                          Signed {timeAgo(p.signedAt)}
                        </div>
                      )}

                      {/* Reminded timestamp */}
                      {!p.signed && p.lastRemindedAt && (
                        <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                          <MailCheck size={10} /> Reminded{" "}
                          {timeAgo(p.lastRemindedAt)}
                        </div>
                      )}
                    </div>

                    {/* Right: Remind button */}
                    {showRemindButton && (
                      <button
                        onClick={() => sendReminder([p.email])}
                        disabled={
                          cooldown.active || remindingEmail === p.email
                        }
                        className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap ${
                          cooldown.active
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-white border border-red-300 text-red-600 hover:bg-red-50"
                        }`}
                        title={
                          cooldown.active
                            ? `Wait ${cooldown.minutesLeft} min`
                            : "Send reminder"
                        }
                      >
                        {remindingEmail === p.email ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : cooldown.active ? (
                          `Wait ${cooldown.minutesLeft}m`
                        ) : (
                          "Remind"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── CC list (informational) ──────────────────────── */}
        {ccs.length > 0 && (
          <div className="border-t border-gray-200 mt-2">
            <div className="px-5 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              CC (informed only)
            </div>
            <div className="divide-y divide-gray-100">
              {ccs.map((p, idx) => (
                <div
                  key={p.email || idx}
                  className="px-5 py-2.5 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-700 truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {p.email}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                    CC
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}