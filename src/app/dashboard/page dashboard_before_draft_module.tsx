"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Upload,
  AlertCircle,
  Clock,
  CheckCircle2,
  Loader2,
  Bell,
  LayoutGrid,
  ChevronRight,
  FilePlus2,
  PenSquare,
  UserPlus,
} from "lucide-react";

const PdfPreviewModal = dynamic(
  () => import("@/components/PdfPreviewModal"),
  { ssr: false }
);

interface Meeting {
  _id: string;
  title: string;
  date: string;
  status: "Draft" | "Sent" | "Completed" | "Prepared";
  participants: {
    name: string;
    email: string;
    signed: boolean;
    isCurrent?: boolean;
  }[];
  sentAt?: string;
  currentSignerIndex?: number;
  createdAt?: string;
  description?: string;
}

function shortDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Dashboard() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [signatureImg, setSignatureImg] = useState<string | null>(null);
  const [initialsImg, setInitialsImg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [previewMeeting, setPreviewMeeting] = useState<Meeting | null>(null);
  const [pageWidth, setPageWidth] = useState(500);

  const sigInputRef = useRef<HTMLInputElement>(null);
  const initialsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updatePageWidth = () => {
      setPageWidth(Math.min(window.innerWidth * 0.5, 500));
    };
    updatePageWidth();
    window.addEventListener("resize", updatePageWidth);
    return () => window.removeEventListener("resize", updatePageWidth);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchAll = async () => {
      try {
        const [profileRes, meetingsRes] = await Promise.all([
          fetch("/api/user/profile", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/meetings", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (profileRes.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("isAdmin");
          router.push("/login?expired=true");
          return;
        }
        if (profileRes.ok) {
          const data = await profileRes.json();
          setUserName(data.name || data.email || "User");
          setSignatureImg(data.signature || null);
          setInitialsImg(data.initialSignature || null);
          if (data.signature)
            localStorage.setItem("userSignature", data.signature);
        }

        if (meetingsRes.ok) {
          const data = await meetingsRes.json();
          setMeetings(data.meetings || []);
          setUserEmail(data.userEmail || null);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [router]);

  const getSigningProgress = (meeting: Meeting) => {
    const signers = meeting.participants.filter((p) => p.signed !== undefined);
    const signed = signers.filter((p) => p.signed).length;
    return { signed, total: signers.length };
  };

  const getDraftedBy = (meeting: Meeting) => {
    if (meeting.participants && meeting.participants.length > 0) {
      return meeting.participants[0].email;
    }
    return "unknown@acc.org.bd";
  };

  const needToSign = useMemo(() => {
    if (!userEmail) return [];
    return meetings.filter((m) => {
      const myParticipant = m.participants.find((p) => p.email === userEmail);
      return myParticipant && !myParticipant.signed && myParticipant.isCurrent;
    });
  }, [meetings, userEmail]);

  const drafts = useMemo(
    () => meetings.filter((m) => m.status === "Draft"),
    [meetings]
  );

  const waitingForOthersCount = useMemo(() => {
    return meetings.filter(
      (m) =>
        m.status === "Sent" &&
        m.participants.some((p) => !p.signed) &&
        !needToSign.some((need) => need._id === m._id)
    ).length;
  }, [meetings, needToSign]);

  const completedCount = useMemo(
    () => meetings.filter((m) => m.status === "Completed").length,
    [meetings]
  );

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const sentThisMonth = useMemo(() => {
    return meetings.filter(
      (m) =>
        m.status === "Sent" &&
        m.sentAt &&
        new Date(m.sentAt).getMonth() === currentMonth &&
        new Date(m.sentAt).getFullYear() === currentYear
    ).length;
  }, [meetings, currentMonth, currentYear]);

  const totalSent = useMemo(
    () => meetings.filter((m) => m.status === "Sent").length,
    [meetings]
  );

  const recentDocuments = useMemo(() => {
    return [...meetings]
      .filter((m) => m.status !== "Draft")
      .sort((a, b) => {
        const dateA = a.sentAt || a.createdAt || "";
        const dateB = b.sentAt || b.createdAt || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 5);
  }, [meetings]);

  const recentDrafts = useMemo(() => {
    return [...drafts]
      .sort((a, b) => {
        const dateA = a.createdAt || "";
        const dateB = b.createdAt || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 4);
  }, [drafts]);

  const gaugeMax = Math.max(sentThisMonth, 4);

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "signature" | "initials"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      if (type === "signature") {
        setSignatureImg(base64String);
      } else {
        setInitialsImg(base64String);
      }
      try {
        setIsUploading(true);
        const token = localStorage.getItem("token");
        const payload: any = {};
        if (type === "signature") {
          payload.signature = base64String;
        } else {
          payload.initialSignature = base64String;
        }
        await fetch("/api/user/update-signature", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePreviewDocument = (meeting: Meeting) => {
    setPreviewMeeting(meeting);
  };

  const closePreview = () => {
    setPreviewMeeting(null);
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-white border border-gray-200 rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-56 bg-white border border-gray-200 rounded-lg animate-pulse" />
          <div className="h-56 bg-white border border-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="sticky top-0 z-20 bg-[#f8f9fc] pb-3 -mt-2 pt-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={() => {}}
            className="relative p-2 hover:bg-gray-100 rounded-full transition cursor-pointer"
            title="Notifications"
          >
            <Bell size={18} className="text-gray-600" />
            {needToSign.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* ─── 4 Action Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionCard
          icon={<FilePlus2 size={16} />}
          title="Start A Document"
          description="Create a new document, send to recipients, and get signatures."
          buttonLabel="New Document"
          onClick={() => router.push("/dashboard/new-meeting")}
        />

        <ActionCard
          icon={<LayoutGrid size={16} />}
          title="My Documents"
          description="Browse all your documents, filter by status, and manage them."
          buttonLabel="View Documents"
          onClick={() => router.push("/dashboard/documents")}
        />

        {/* ⬇️ Sign Pending now redirects to the "I Need to Sign" tab */}
        <ActionCard
          icon={<PenSquare size={16} />}
          title="Sign Pending"
          description={
            needToSign.length > 0
              ? `You have ${needToSign.length} document${
                  needToSign.length > 1 ? "s" : ""
                } awaiting your signature.`
              : "You have no documents awaiting your signature."
          }
          buttonLabel={
            needToSign.length > 0 ? "Start Signing" : "All Caught Up"
          }
          disabled={needToSign.length === 0}
          onClick={() =>
            router.push("/dashboard/documents?tab=need-to-sign")
          }
        />

        <ActionCard
          icon={<UserPlus size={16} />}
          title="Add A Contact"
          description="Manage users and contacts for faster document sending."
          buttonLabel="Manage Users"
          onClick={() => router.push("/admin/all-users")}
        />
      </div>

      {/* ─── Documents + Recent Activity ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">Documents</h3>
            <button
              onClick={() => router.push("/dashboard/documents")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              View All Documents
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            <StatusRow
              icon={<AlertCircle size={14} />}
              bg="bg-red-500"
              label="Awaiting my signature"
              count={needToSign.length}
              onClick={() =>
                router.push("/dashboard/documents?tab=need-to-sign")
              }
            />
            <StatusRow
              icon={<Clock size={14} />}
              bg="bg-gray-500"
              label="Waiting for others"
              count={waitingForOthersCount}
              onClick={() => router.push("/dashboard/documents")}
            />
            <StatusRow
              icon={<CheckCircle2 size={14} />}
              bg="bg-green-600"
              label="Completed"
              count={completedCount}
              onClick={() => router.push("/dashboard/documents")}
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">
              Recent Activity
            </h3>
            <button
              onClick={() => router.push("/dashboard/documents")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              View All Activity
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {recentDocuments.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                No recent activity
              </div>
            ) : (
              recentDocuments.slice(0, 5).map((meeting) => {
                const progress = getSigningProgress(meeting);
                return (
                  <button
                    key={meeting._id}
                    onClick={() => handlePreviewDocument(meeting)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition cursor-pointer group"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
                            {shortDate(meeting.sentAt || meeting.createdAt)}
                          </span>
                          <span className="text-sm font-medium text-gray-800 truncate group-hover:text-indigo-700">
                            {meeting.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] text-gray-500 truncate">
                            drafted by {getDraftedBy(meeting)}
                          </span>

                          {meeting.status === "Completed" && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
                              ✓ Completed
                            </span>
                          )}

                          {meeting.status === "Sent" && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
                              {progress.signed}/{progress.total} signed
                            </span>
                          )}

                          {meeting.status === "Draft" && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
                              Draft
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        size={14}
                        className="text-gray-300 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── My Signature + Gauge + Info ─────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
          <div className="p-5 space-y-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-bold text-gray-800">
                  My Signature
                </h4>
                <button
                  onClick={() => sigInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <input
                type="file"
                ref={sigInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => handleFileChange(e, "signature")}
              />
              <div
                onClick={() => sigInputRef.current?.click()}
                className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition cursor-pointer flex items-center justify-center min-h-[70px]"
              >
                {signatureImg ? (
                  <img
                    src={signatureImg}
                    alt="Signature"
                    className="max-h-14 object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center text-gray-400">
                    <Upload size={18} />
                    <span className="text-[10px] mt-1">Click to upload</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-bold text-gray-800">
                  My Initials
                </h4>
                <button
                  onClick={() => initialsInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <input
                type="file"
                ref={initialsInputRef}
                className="hidden"
                accept="image/*"
                onChange={(e) => handleFileChange(e, "initials")}
              />
              <div
                onClick={() => initialsInputRef.current?.click()}
                className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition cursor-pointer flex items-center justify-center min-h-[60px]"
              >
                {initialsImg ? (
                  <img
                    src={initialsImg}
                    alt="Initials"
                    className="max-h-12 object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center text-gray-400">
                    <Upload size={14} />
                    <span className="text-[10px] mt-1">Click to upload</span>
                  </div>
                )}
              </div>
            </div>

            {isUploading && (
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="animate-spin" size={12} /> Uploading...
              </div>
            )}
          </div>

          <div className="p-5 flex flex-col items-center justify-center">
            <h4 className="text-sm font-bold text-gray-800 mb-4 text-center">
              Documents sent this month
            </h4>
            <GaugeChart value={sentThisMonth} max={gaugeMax} />
            <div className="mt-3 text-center">
              <div className="text-lg font-bold text-gray-900">
                {sentThisMonth}
              </div>
              <div className="text-[11px] text-gray-500">Documents Sent</div>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            <InfoBlock
              title="Account"
              lines={[
                `Name: ${userName}`,
                `Email: ${userEmail || "—"}`,
                `Total documents: ${meetings.length}`,
              ]}
            />
            <InfoBlock
              title="Activity"
              lines={[
                `Completed: ${completedCount}`,
                `Pending my signature: ${needToSign.length}`,
                `Waiting for others: ${waitingForOthersCount}`,
              ]}
            />
            <InfoBlock
              title="This Month"
              lines={[
                `Sent: ${sentThisMonth}`,
                `Total sent (all time): ${totalSent}`,
                `Drafts: ${drafts.length}`,
              ]}
            />
          </div>
        </div>
      </div>

      {/* ─── Templates + Recent Drafts ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">
              Most Used Templates
            </h3>
            <button
              disabled
              className="text-xs text-gray-400 font-semibold cursor-not-allowed"
            >
              View All Templates
            </button>
          </div>
          <div className="px-4 py-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <LayoutGrid size={20} className="text-gray-400" />
            </div>
            <p className="text-xs text-gray-500">
              You haven't used any templates yet.
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-800">Recent drafts</h3>
            {drafts.length > 0 && (
              <button
                onClick={() => router.push("/dashboard/documents")}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                View All Drafts
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {recentDrafts.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                No drafts yet
              </div>
            ) : (
              recentDrafts.map((draft) => (
                <button
                  key={draft._id}
                  onClick={() =>
                    router.push(`/dashboard/prepare/${draft._id}`)
                  }
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-sm text-gray-800 truncate">
                      {draft.title}
                    </span>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">
                      {shortDate(draft.createdAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {previewMeeting && (
        <PdfPreviewModal
          meeting={previewMeeting}
          pageWidth={pageWidth}
          onClose={closePreview}
          onSign={() => router.push(`/sign/${previewMeeting._id}`)}
        />
      )}
    </div>
  );
}

// ─── ActionCard ────────────────────────────────────────────────
function ActionCard({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col hover:shadow-md transition">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-600">{icon}</span>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-4">
        {description}
      </p>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition w-fit cursor-pointer ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// ─── StatusRow ─────────────────────────────────────────────────
function StatusRow({
  icon,
  bg,
  label,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-7 h-7 rounded-md flex items-center justify-center text-white ${bg}`}
        >
          {icon}
        </span>
        <span className="text-sm text-gray-800">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {count > 0 && (
          <span className="text-sm font-bold text-gray-900">{count}</span>
        )}
        <span className="text-xs text-indigo-600 font-semibold">
          Show all
        </span>
      </div>
    </button>
  );
}

// ─── InfoBlock ─────────────────────────────────────────────────
function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="px-5 py-4">
      <h4 className="text-sm font-bold text-gray-800 mb-1.5">{title}</h4>
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-gray-600 leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}

// ─── GaugeChart ────────────────────────────────────────────────
function GaugeChart({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const radius = 55;
  const strokeWidth = 14;
  const cx = 75;
  const cy = 75;
  const circumference = Math.PI * radius;
  const dashoffset = circumference * (1 - pct);

  return (
    <svg width="150" height="85" viewBox="0 0 150 85">
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${
          cx + radius
        } ${cy}`}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${
          cx + radius
        } ${cy}`}
        fill="none"
        stroke="#4F46E5"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="fill-gray-900"
        style={{ fontSize: "20px", fontWeight: "bold" }}
      >
        {value}
      </text>
      <text
        x={cx}
        y={cy + 10}
        textAnchor="middle"
        className="fill-gray-500"
        style={{ fontSize: "9px" }}
      >
        Documents Sent
      </text>
      <text
        x={cx - radius - 4}
        y={cy + 14}
        textAnchor="middle"
        className="fill-gray-400"
        style={{ fontSize: "9px" }}
      >
        0
      </text>
      <text
        x={cx + radius + 4}
        y={cy + 14}
        textAnchor="middle"
        className="fill-gray-400"
        style={{ fontSize: "9px" }}
      >
        {max}
      </text>
    </svg>
  );
}