"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Upload,
  AlertCircle,
  Clock,
  CheckCircle2,
  Edit3,
  Loader2,
  Send,
  User,
  FileText,
  Plus,
  Bell,
  X,
  ChevronRight,
  LayoutGrid,
  Users,
  Settings,
  Shield,
  TrendingUp,
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

export default function Dashboard() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [signatureImg, setSignatureImg] = useState<string | null>(null);
  const [initialsImg, setInitialsImg] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [previewMeeting, setPreviewMeeting] = useState<Meeting | null>(null);
  const [pageWidth, setPageWidth] = useState(500);

  const sigInputRef = useRef<HTMLInputElement>(null);
  const initialsInputRef = useRef<HTMLInputElement>(null);

  // ─── Resize listener ─────────────────────────────────────────
  useEffect(() => {
    const updatePageWidth = () => {
      setPageWidth(Math.min(window.innerWidth * 0.5, 500));
    };
    updatePageWidth();
    window.addEventListener("resize", updatePageWidth);
    return () => window.removeEventListener("resize", updatePageWidth);
  }, []);

  // ─── Fetch profile + meetings ────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token");
    const adminFlag = localStorage.getItem("isAdmin");
    setIsAdmin(adminFlag === "true");

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

  // ─── Derived data ────────────────────────────────────────────
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

  const waitingForOthers = useMemo(() => {
    return meetings.filter(
      (m) =>
        m.status === "Sent" &&
        m.participants.some((p) => !p.signed) &&
        !needToSign.some((need) => need._id === m._id)
    );
  }, [meetings, needToSign]);

  const completed = useMemo(
    () => meetings.filter((m) => m.status === "Completed"),
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

  const completedThisMonth = useMemo(() => {
    return meetings.filter(
      (m) =>
        m.status === "Completed" &&
        m.createdAt &&
        new Date(m.createdAt).getMonth() === currentMonth &&
        new Date(m.createdAt).getFullYear() === currentYear
    ).length;
  }, [meetings, currentMonth, currentYear]);

  const recentActivity = useMemo(() => {
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

  const progress = useMemo(() => {
    const signed = meetings.filter(
      (m) => m.status === "Sent" || m.status === "Completed"
    );
    const total = signed.length;
    const completedCount = signed.filter(
      (m) => m.status === "Completed"
    ).length;
    return { signed: completedCount, total };
  }, [meetings]);

  // ─── Upload handlers ─────────────────────────────────────────
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

  // ─── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 bg-white border border-gray-200 rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-white border border-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-12">
      {/* ─── Header ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#f8f9fc] pb-3 -mt-2 pt-2">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <button
            className="relative p-2 hover:bg-gray-100 rounded-full transition"
            title="Notifications"
          >
            <Bell size={18} className="text-gray-600" />
            {needToSign.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* ─── Quick Actions row ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionCard
          icon={<FileText size={18} />}
          title="Start A Document"
          description="Create a new document, send to recipients, and get signatures."
          buttonLabel="New Document"
          onClick={() => router.push("/dashboard/new-meeting")}
        />
        <ActionCard
          icon={<LayoutGrid size={18} />}
          title="My Documents"
          description="Browse all your documents, filter by status, and manage them."
          buttonLabel="View Documents"
          onClick={() => router.push("/dashboard/documents")}
        />
        <ActionCard
          icon={<Edit3 size={18} />}
          title="Sign Pending"
          description={`${
            needToSign.length > 0
              ? `You have ${needToSign.length} document${
                  needToSign.length > 1 ? "s" : ""
                } awaiting your signature.`
              : "No documents awaiting your signature right now."
          }`}
          buttonLabel={needToSign.length > 0 ? "Start Signing" : "All Caught Up"}
          disabled={needToSign.length === 0}
          onClick={() => {
            if (needToSign.length > 0) {
              router.push(`/sign/${needToSign[0]._id}`);
            }
          }}
        />
        <ActionCard
          icon={<Users size={18} />}
          title="Add A Contact"
          description="Reuse contacts across documents for faster sending."
          buttonLabel="Manage Users"
          onClick={() => router.push(isAdmin ? "/admin/all-users" : "/settings")}
        />
      </div>

      {/* ─── Two-column: Documents / Recent Activity ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Documents card */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">Documents</h3>
            <button
              onClick={() => router.push("/dashboard/documents")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              View All Documents
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            <StatusRow
              icon={<AlertCircle size={16} />}
              color="red"
              label="Awaiting my signature"
              count={needToSign.length}
              onClick={() => {
                if (needToSign.length > 0) {
                  router.push(`/sign/${needToSign[0]._id}`);
                }
              }}
            />
            <StatusRow
              icon={<Clock size={16} />}
              color="gray"
              label="Waiting for others"
              count={waitingForOthers.length}
              onClick={() => router.push("/dashboard/documents")}
            />
            <StatusRow
              icon={<CheckCircle2 size={16} />}
              color="green"
              label="Completed"
              count={completed.length}
              onClick={() => router.push("/dashboard/documents")}
            />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">
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
            {recentActivity.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-gray-400">
                No recent activity
              </div>
            ) : (
              recentActivity.map((m) => (
                <button
                  key={m._id}
                  onClick={() => handlePreviewDocument(m)}
                  className="w-full text-left px-5 py-3 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">
                          {formatDate(m.sentAt || m.createdAt)}
                        </span>
                        <span className="text-sm text-gray-800 truncate group-hover:text-indigo-700">
                          {m.title}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {m.status === "Completed"
                          ? "Completed"
                          : m.status === "Sent"
                          ? "Sent for signature"
                          : m.status}
                        {" · "}
                        {m.participants.length} participant
                        {m.participants.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ChevronRight
                      size={14}
                      className="text-gray-300 shrink-0 mt-1"
                    />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── Two-column: Signature / Account ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signature + Documents sent */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Left: signature + initials */}
            <div className="p-5 space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-bold text-gray-900">
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
                  className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition cursor-pointer flex items-center justify-center min-h-[60px]"
                >
                  {signatureImg ? (
                    <img
                      src={signatureImg}
                      alt="Signature"
                      className="max-h-12 object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <Upload size={18} />
                      <span className="text-[10px] mt-1">
                        Click to upload
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-sm font-bold text-gray-900">
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
                  className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition cursor-pointer flex items-center justify-center min-h-[50px]"
                >
                  {initialsImg ? (
                    <img
                      src={initialsImg}
                      alt="Initials"
                      className="max-h-10 object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-gray-400">
                      <Upload size={14} />
                      <span className="text-[10px] mt-1">
                        Click to upload
                      </span>
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

            {/* Right: gauge */}
            <div className="p-5 flex flex-col items-center justify-center">
              <h4 className="text-sm font-bold text-gray-900 mb-4">
                Documents sent this month
              </h4>
              <GaugeChart
                value={sentThisMonth}
                max={Math.max(sentThisMonth, 4)}
              />
              <div className="mt-3 text-center">
                <div className="text-lg font-bold text-gray-900">
                  {sentThisMonth}
                </div>
                <div className="text-[11px] text-gray-500">
                  Documents Sent
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm divide-y divide-gray-100">
          <InfoBlock
            title="Account"
            lines={[
              `Name: ${userName}`,
              `Email: ${userEmail || "—"}`,
              `Role: ${isAdmin ? "Administrator" : "Signer"}`,
            ]}
          />
          <InfoBlock
            title="Activity"
            lines={[
              `Total documents: ${meetings.length}`,
              `Completed: ${completed.length}`,
              `Pending signatures: ${needToSign.length}`,
            ]}
          />
          <InfoBlock
            title="This Month"
            lines={[
              `Sent: ${sentThisMonth}`,
              `Completed: ${completedThisMonth}`,
              `Drafts: ${drafts.length}`,
            ]}
          />
        </div>
      </div>

      {/* ─── Two-column: Templates / Recent Drafts ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Templates placeholder */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">
              Most Used Templates
            </h3>
            <button
              disabled
              className="text-xs text-gray-400 font-semibold cursor-not-allowed"
            >
              View All Templates
            </button>
          </div>
          <div className="px-5 py-10 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <LayoutGrid size={20} className="text-gray-400" />
            </div>
            <p className="text-xs text-gray-500">
              You haven't used any templates yet.{" "}
              <button
                disabled
                className="text-indigo-400 underline cursor-not-allowed"
              >
                Use or create a template.
              </button>
            </p>
          </div>
        </div>

        {/* Recent Drafts */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">Recent drafts</h3>
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
              <div className="px-5 py-8 text-center text-xs text-gray-400">
                No drafts yet
              </div>
            ) : (
              recentDrafts.map((draft) => (
                <button
                  key={draft._id}
                  onClick={() =>
                    router.push(`/dashboard/prepare/${draft._id}`)
                  }
                  className="w-full text-left px-5 py-3 hover:bg-gray-50 transition cursor-pointer"
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="text-sm text-gray-800 truncate">
                      {draft.title}
                    </span>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">
                      {formatDate(draft.createdAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ─── PDF Preview Modal ────────────────────────────────── */}
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

// ─── Helper: format date as "Mar 27 2026" ────────────────────────
function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── ActionCard ─────────────────────────────────────────────────
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
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col shadow-sm hover:shadow-md transition">
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
        className={`text-xs font-semibold px-3 py-1.5 rounded-md transition w-fit ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 cursor-pointer"
        }`}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

// ─── StatusRow ──────────────────────────────────────────────────
function StatusRow({
  icon,
  color,
  label,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  color: "red" | "gray" | "green";
  label: string;
  count: number;
  onClick: () => void;
}) {
  const colors = {
    red: "bg-red-500 text-white",
    gray: "bg-gray-500 text-white",
    green: "bg-green-600 text-white",
  };
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-7 h-7 rounded-md flex items-center justify-center ${colors[color]}`}
        >
          {icon}
        </span>
        <span className="text-sm font-medium text-gray-800">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {count > 0 ? (
          <>
            <span className="text-sm font-bold text-gray-900">{count}</span>
            <span className="text-xs text-indigo-600 font-semibold">
              Show all
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    </button>
  );
}

// ─── InfoBlock ──────────────────────────────────────────────────
function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="px-5 py-4">
      <h4 className="text-sm font-bold text-gray-900 mb-1.5">{title}</h4>
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-gray-600 leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}

// ─── GaugeChart (half-circle) ───────────────────────────────────
function GaugeChart({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const radius = 60;
  const strokeWidth = 14;
  const cx = 80;
  const cy = 80;
  const circumference = Math.PI * radius;
  const dashoffset = circumference * (1 - pct);

  return (
    <svg width="160" height="90" viewBox="0 0 160 90">
      {/* Background arc */}
      <path
        d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${
          cx + radius
        } ${cy}`}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Filled arc */}
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
      {/* Value in middle */}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        className="fill-gray-900 font-bold"
        style={{ fontSize: "20px" }}
      >
        {value}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        className="fill-gray-500"
        style={{ fontSize: "9px" }}
      >
        Documents Sent
      </text>
    </svg>
  );
}