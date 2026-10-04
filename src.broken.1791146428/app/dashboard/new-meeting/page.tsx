"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  X,
  FileText,
  Upload,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  GripVertical,
  UserPlus,
  Trash2,
} from "lucide-react";

const NewMeetingPdfClient = dynamic(() => import("./NewMeetingPdfClient"), {
  ssr: false,
});

interface Participant {
  name: string;
  email: string;
  role: "Signer" | "CC";
  department?: string;
  division?: string;
  designation?: string;
  phoneNumber?: string;
  isExternal?: boolean;
}

const MAX_FILE_SIZE_MB = 20;
const INTERNAL_DOMAIN = "@acc.org.bt";

export default function NewMeetingPage() {
  // ─── Document state ─────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [signingMode, setSigningMode] = useState<"sequential" | "parallel">(
    "sequential"
  );
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ─── Participants + drag ─────────────────────────────────────────
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // ─── Internal user picker ────────────────────────────────────────
  const [departments, setDepartments] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [filteredDivisions, setFilteredDivisions] = useState<any[]>([]);
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterDivision, setFilterDivision] = useState("");
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // ─── External signer form ────────────────────────────────────────
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalError, setExternalError] = useState("");
  const [externalSuccess, setExternalSuccess] = useState("");

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ─── Fetch departments + divisions on mount ─────────────────────
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const token = localStorage.getItem("token");
        const [deptRes, divRes] = await Promise.all([
          fetch("/api/admin/departments", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/admin/divisions", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const deptData = await deptRes.json();
        const divData = await divRes.json();
        setDepartments(deptData.departments || []);
        setDivisions(divData.divisions || []);
      } catch (err) {
        console.error("Failed to fetch options:", err);
      }
    };
    fetchOptions();
  }, []);

  // ─── Filter divisions when department changes ───────────────────
  useEffect(() => {
    if (filterDepartment) {
      const selectedDept = departments.find((d) => d.name === filterDepartment);
      if (selectedDept) {
        const deptIdStr =
          typeof selectedDept._id === "string"
            ? selectedDept._id
            : selectedDept._id.toString();
        const filtered = divisions.filter((div) => {
          const divDeptIdStr =
            typeof div.departmentId === "string"
              ? div.departmentId
              : div.departmentId?.toString();
          return divDeptIdStr === deptIdStr;
        });
        setFilteredDivisions(filtered);
        if (
          filterDivision &&
          !filtered.find((d) => d.name === filterDivision)
        ) {
          setFilterDivision("");
        }
      }
    } else {
      setFilteredDivisions([]);
      setFilterDivision("");
    }
  }, [filterDepartment, departments, divisions, filterDivision]);

  // ─── Fetch users when dept/division changes (debounced) ─────────
  useEffect(() => {
    if (!filterDepartment) {
      setFilteredUsers([]);
      return;
    }

    setIsLoadingUsers(true);
    const timeout = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token");
        let url = `/api/user/by-department-division?department=${encodeURIComponent(
          filterDepartment
        )}`;
        if (filterDivision) {
          url += `&division=${encodeURIComponent(filterDivision)}`;
        }
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setFilteredUsers(data.users || []);
        }
      } catch (err) {
        console.error("Error fetching users:", err);
      } finally {
        setIsLoadingUsers(false);
      }
    }, 300); // debounce 300ms

    return () => clearTimeout(timeout);
  }, [filterDepartment, filterDivision]);

  // ─── Participant helpers ────────────────────────────────────────
  const removeParticipant = (emailToRemove: string) => {
    setParticipants((prev) => prev.filter((p) => p.email !== emailToRemove));
  };

  const updateRole = (emailToUpdate: string, role: "Signer" | "CC") => {
    setParticipants((prev) =>
      prev.map((p) => (p.email === emailToUpdate ? { ...p, role } : p))
    );
  };

  const clearAllParticipants = () => {
    if (
      participants.length > 0 &&
      window.confirm(`Remove all ${participants.length} participants?`)
    ) {
      setParticipants([]);
    }
  };

  const addInternalUser = (user: any) => {
    if (participants.some((p) => p.email === user.email)) return;
    setParticipants((prev) => [
      ...prev,
      {
        name: user.name,
        email: user.email,
        role: "Signer",
        department: user.department,
        division: user.division,
        designation: user.designation,
        phoneNumber: user.phoneNumber,
      },
    ]);
  };

  // ─── External signer add ────────────────────────────────────────
  const addExternalSigner = () => {
    setExternalError("");
    setExternalSuccess("");

    const name = externalName.trim();
    const email = externalEmail.trim().toLowerCase();

    if (!name) {
      setExternalError("Name is required.");
      return;
    }
    if (!email) {
      setExternalError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setExternalError("Please enter a valid email address.");
      return;
    }
    if (email.endsWith(INTERNAL_DOMAIN)) {
      setExternalError(
        `Internal ${INTERNAL_DOMAIN} users must be added from the department/division picker above.`
      );
      return;
    }
    if (participants.some((p) => p.email.toLowerCase() === email)) {
      setExternalError("This email is already in the participant list.");
      return;
    }

    setParticipants((prev) => [
      ...prev,
      { name, email, role: "Signer", isExternal: true },
    ]);
    setExternalName("");
    setExternalEmail("");
    setExternalSuccess(`Added ${name} (${email}) as external signer.`);

    // clear success after 3s
    setTimeout(() => setExternalSuccess(""), 3000);
  };

  // ─── Drag-and-drop reordering ───────────────────────────────────
  const handleDragStart = (index: number) => setDraggedIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const newParticipants = [...participants];
    const draggedItem = newParticipants[draggedIndex];
    newParticipants.splice(draggedIndex, 1);
    newParticipants.splice(index, 0, draggedItem);
    setParticipants(newParticipants);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => setDraggedIndex(null);

  // ─── File change with size check ────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setMessage(
        `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`
      );
      e.target.value = "";
      return;
    }
    setMessage("");
    setFile(selected);
  };

  // ─── Validation ─────────────────────────────────────────────────
  const validate = (isDraft: boolean) => {
    if (!file) return "Please upload a PDF file.";
    if (participants.length === 0)
      return "Add at least one signer/participant.";
    if (!isDraft) {
      // Prepare mode requires more
      if (!title.trim()) return "Document Title is required.";
      if (!description.trim()) return "Message is required.";
    }
    return null;
  };

  const handleSubmit = async (prepare: boolean) => {
    setMessage("");
    setIsSubmitting(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("Missing token. Please log in again.");
      setIsSubmitting(false);
      return;
    }

    const error = validate(!prepare);
    if (error) {
      setMessage(error);
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    if (file) formData.append("file", file);
    formData.append(
      "data",
      JSON.stringify({
        title,
        description,
        participants,
        action: prepare ? "prepare" : "draft",
        signingMode,
      })
    );

    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        if (prepare) router.push(`/dashboard/prepare/${data.meetingId}`);
        else router.push("/dashboard");
      } else {
        setMessage(data.error || "Failed to save meeting");
      }
    } catch (err) {
      setMessage("Server error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const signers = useMemo(
    () => participants.filter((p) => p.role === "Signer"),
    [participants]
  );

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#2d3748] pb-20">
      <header className="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="cursor-pointer text-gray-400 hover:text-indigo-600 transition"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-indigo-900">New Document</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={isSubmitting}
            onClick={() => handleSubmit(false)}
            className="cursor-pointer px-5 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-full hover:bg-indigo-50 transition disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Draft"}
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => handleSubmit(true)}
            className="cursor-pointer px-6 py-2 text-sm font-medium text-white bg-[#1a2b4a] rounded-full hover:bg-[#0f1b2e] transition shadow-md flex items-center gap-2 disabled:opacity-50"
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            Prepare
          </button>
        </div>
      </header>

      {/* Error / notification bar */}
      {message && (
        <div className="sticky top-[73px] z-40 px-6 pt-4">
          <div className="max-w-5xl mx-auto p-4 bg-red-50 border-2 border-red-300 text-red-700 rounded-xl text-sm text-center font-semibold shadow-lg">
            ⚠️ {message}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* ─── File Upload ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl p-6 shadow-lg">
          <h2 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 text-indigo-600" />
            Document Upload
          </h2>
          <div className="flex gap-6">
            <div className="w-52 h-72 border-2 border-gray-200 rounded-xl flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 relative group overflow-hidden shadow-lg">
              {file ? (
                <>
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <NewMeetingPdfClient file={file} />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                    <p className="text-[10px] font-bold truncate">
                      {file.name}
                    </p>
                    <p className="text-[9px] text-white/70">
                      {(file.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="absolute top-2 right-2 bg-white text-red-500 hover:bg-red-500 hover:text-white rounded-full p-1.5 shadow-lg transition-all opacity-0 group-hover:opacity-100 z-30"
                    aria-label="Remove file"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <Upload className="w-12 h-12 text-gray-300 mb-3" />
                  <p className="text-xs text-gray-400 font-medium">
                    No file selected
                  </p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              id="file-input"
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex-1 flex flex-col justify-center items-center border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/30 p-8 text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">
                {file ? "Document Ready" : "Upload Your Document"}
              </h3>
              <p className="text-xs text-gray-500 mb-4 max-w-xs">
                {file
                  ? "Your document is ready. You can change it or proceed to prepare."
                  : `Click below or drag and drop a PDF file to get started. Max ${MAX_FILE_SIZE_MB} MB.`}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer bg-[#1a2b4a] hover:bg-[#0f1b2e] text-white px-6 py-2.5 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
              >
                <Upload size={16} />
                {file ? "Change Document" : "Choose File"}
              </button>
              <p className="text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-widest">
                Supported: PDF files only • Max {MAX_FILE_SIZE_MB} MB
              </p>
              {file && (
                <div className="mt-4 px-4 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200 flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  Ready to Upload
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── Add Internal Users ──────────────────────────────── */}
        <section className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="px-6 py-3 bg-gray-200 border-b border-gray-100">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <FileText className="w-4 h-4 text-indigo-600" /> Add by
              Department / Division
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="dept-select"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Department
                </label>
                <select
                  id="dept-select"
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="w-full text-sm p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none transition bg-white"
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="div-select"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Division
                </label>
                <select
                  id="div-select"
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  disabled={!filterDepartment}
                  className="w-full text-sm p-2.5 border rounded-lg focus:ring-2 focus:ring-indigo-100 outline-none transition bg-white disabled:bg-gray-50"
                >
                  <option value="">
                    {filterDepartment
                      ? "All Divisions"
                      : "Select Department First"}
                  </option>
                  {filteredDivisions.map((div) => (
                    <option key={div._id} value={div.name}>
                      {div.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-indigo-600" size={24} />
                <span className="ml-2 text-sm text-gray-500">
                  Loading users...
                </span>
              </div>
            ) : filteredUsers.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto rounded-lg p-3 bg-gray-50 shadow-sm">
                {filteredUsers.map((user) => {
                  const isAdded = participants.some(
                    (p) => p.email === user.email
                  );
                  return (
                    <div
                      key={user._id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition shadow-sm group"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {user.name}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                        {user.designation && (
                          <p className="text-xs text-gray-400">
                            {user.designation}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => addInternalUser(user)}
                        disabled={isAdded}
                        className={`cursor-pointer px-4 py-1.5 text-xs font-medium rounded-lg transition ${
                          isAdded
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-indigo-600 text-white hover:bg-indigo-700"
                        }`}
                      >
                        {isAdded ? "Added" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : filterDepartment ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No users found in this{" "}
                {filterDivision ? "division" : "department"}.
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                Select a department to see available users
              </div>
            )}
          </div>
        </section>

        {/* ─── Add External Signer ─────────────────────────────── */}
        <section className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="px-6 py-3 bg-gray-200 border-b border-gray-100">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <UserPlus className="w-4 h-4 text-orange-500" /> Add External
              Signer
            </h3>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-xs text-gray-500">
              For signers without an {INTERNAL_DOMAIN} account. They'll receive
              an email with a link to sign the document.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="ext-name"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="ext-name"
                  type="text"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full text-sm p-2.5 border rounded-lg focus:ring-2 focus:ring-orange-100 outline-none transition"
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addExternalSigner())
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="ext-email"
                  className="block text-xs font-medium text-gray-600 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="ext-email"
                  type="email"
                  value={externalEmail}
                  onChange={(e) => setExternalEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full text-sm p-2.5 border rounded-lg focus:ring-2 focus:ring-orange-100 outline-none transition"
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), addExternalSigner())
                  }
                />
              </div>
            </div>
            {externalError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                ⚠️ {externalError}
              </div>
            )}
            {externalSuccess && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle2 size={14} /> {externalSuccess}
              </div>
            )}
            <button
              type="button"
              onClick={addExternalSigner}
              className="cursor-pointer bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg font-semibold text-sm transition flex items-center gap-2"
            >
              <UserPlus size={16} />
              Add External Signer
            </button>
          </div>
        </section>

        {/* ─── Signers & CCs ───────────────────────────────────── */}
        <section className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="px-6 py-3 bg-gray-200 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" /> Signers &
              CCs{" "}
              {participants.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {participants.length}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-3">
              {participants.length > 0 && (
                <p className="text-xs text-gray-500 italic flex items-center gap-1">
                  <GripVertical size={12} /> Drag to reorder
                </p>
              )}
              {participants.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllParticipants}
                  className="cursor-pointer text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1"
                >
                  <Trash2 size={12} /> Clear all
                </button>
              )}
            </div>
          </div>

          <div className="p-4 space-y-3 bg-white">
            {participants.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                No participants added yet. Use the pickers above.
              </div>
            ) : (
              participants.map((p, index) => (
                <div
                  key={p.email}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white shadow-sm hover:shadow-md transition group cursor-move"
                >
                  <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-indigo-600">
                    <GripVertical size={18} />
                  </div>
                  <div className="w-6 h-6 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 flex gap-2 items-center">
                    <input
                      readOnly
                      value={p.name}
                      className="flex-1 text-sm p-2 border rounded bg-gray-50 text-gray-600"
                    />
                    <input
                      readOnly
                      value={p.email}
                      className="flex-[1.2] text-sm p-2 border rounded bg-gray-50 text-gray-600"
                    />
                    {p.isExternal && (
                      <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-semibold whitespace-nowrap">
                        External
                      </span>
                    )}
                  </div>
                  <select
                    value={p.role}
                    onChange={(e) =>
                      updateRole(p.email, e.target.value as "Signer" | "CC")
                    }
                    className="cursor-pointer text-xs p-2 border rounded bg-white outline-none font-medium"
                  >
                    <option value="Signer">Signer</option>
                    <option value="CC">CC</option>
                  </select>
                  <button
                    onClick={() => removeParticipant(p.email)}
                    className="cursor-pointer p-2 text-gray-400 hover:text-red-500 transition"
                    type="button"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ─── Signing Order ───────────────────────────────────── */}
        <section className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="px-6 py-3 bg-gray-200 border-b border-gray-100">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <FileText className="w-4 h-4 text-indigo-600" /> Signing Order
            </h3>
          </div>
          <div className="p-6 bg-white space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label
                  htmlFor="mode-sequential"
                  className={`flex items-center gap-3 p-4 rounded-lg shadow-sm cursor-pointer transition hover:bg-gray-100 border-2 ${
                    signingMode === "sequential"
                      ? "border-[#1a2b4a]"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    id="mode-sequential"
                    type="radio"
                    name="signingMode"
                    value="sequential"
                    checked={signingMode === "sequential"}
                    onChange={(e) =>
                      setSigningMode(
                        e.target.value as "sequential" | "parallel"
                      )
                    }
                    className="w-4 h-4 text-indigo-600 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-800">
                        Sequential (One by One)
                      </span>
                      {signingMode === "sequential" && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Each signer receives the document only after the previous
                      person has signed. Ensures a specific signing order.
                    </p>
                  </div>
                </label>
              </div>
              <div className="flex-1">
                <label
                  htmlFor="mode-parallel"
                  className={`flex items-center gap-3 p-4 rounded-lg shadow-sm cursor-pointer transition hover:bg-gray-100 border-2 ${
                    signingMode === "parallel"
                      ? "border-[#1a2b4a]"
                      : "border-gray-200"
                  }`}
                >
                  <input
                    id="mode-parallel"
                    type="radio"
                    name="signingMode"
                    value="parallel"
                    checked={signingMode === "parallel"}
                    onChange={(e) =>
                      setSigningMode(
                        e.target.value as "sequential" | "parallel"
                      )
                    }
                    className="w-4 h-4 text-indigo-600 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-gray-800">
                      Parallel (All at Once)
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      All signers receive the document simultaneously and can
                      sign in any order. Faster completion.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {signingMode === "sequential" && signers.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 shadow-sm border-l-4 border-blue-300">
                <p className="text-xs font-semibold text-blue-800 mb-2">
                  📋 Signing Order Preview:
                </p>
                <ol className="space-y-1">
                  {signers.map((p, idx) => (
                    <li key={p.email} className="text-xs text-blue-700">
                      <span className="font-bold">{idx + 1}.</span> {p.name} (
                      {p.email}){p.isExternal && " — External"}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>

        {/* ─── Title & Message ─────────────────────────────────── */}
        <section className="bg-white rounded-xl overflow-hidden shadow-lg">
          <div className="px-6 py-3 bg-gray-200 border-b border-gray-100">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
              <FileText className="w-4 h-4" /> Title & Message
            </h3>
          </div>
          <div className="p-6 bg-white space-y-4">
            <div>
              <label
                htmlFor="doc-title"
                className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider"
              >
                Document Title{" "}
                <span className="text-gray-400 normal-case font-normal">
                  (required for Prepare)
                </span>
              </label>
              <input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Service Agreement"
                className="w-full p-3 border rounded-xl bg-[#f8fafc] text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
            <div>
              <label
                htmlFor="doc-message"
                className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider"
              >
                Message{" "}
                <span className="text-gray-400 normal-case font-normal">
                  (required for Prepare)
                </span>
              </label>
              <textarea
                id="doc-message"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please sign this document..."
                className="w-full p-3 border rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}