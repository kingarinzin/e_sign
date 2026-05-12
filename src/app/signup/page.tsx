"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  // Personal Information
  const [name, setName] = useState("");
  const [cidNumber, setCidNumber] = useState("");
  const [designation, setDesignation] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");

  // Organization Details
  const [department, setDepartment] = useState("");
  const [division, setDivision] = useState("");
  const [departments, setDepartments] = useState<any[]>([]);
  const [allDivisions, setAllDivisions] = useState<any[]>([]);
  const [filteredDivisions, setFilteredDivisions] = useState<any[]>([]);

  // Password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [inlineMessage, setInlineMessage] = useState<{ text: string; type: "error" | "success" } | null>(null);

  // Clear message on any user interaction
  const clearMessageOnInteraction = () => {
    if (inlineMessage) setInlineMessage(null);
  };

  // Fetch departments and divisions
  useEffect(() => {
    async function fetchOptions() {
      try {
        const [deptRes, divRes] = await Promise.all([
          fetch("/api/admin/departments"),
          fetch("/api/admin/divisions"),
        ]);
        const deptData = await deptRes.json();
        const divData = await divRes.json();
        setDepartments(deptData.departments || []);
        setAllDivisions(divData.divisions || []);
      } catch (err) {
        console.error("Failed to fetch options:", err);
      }
    }
    fetchOptions();
  }, []);

  // Filter divisions when department changes
  useEffect(() => {
    if (department) {
      const selectedDept = departments.find((d) => d.name === department);
      if (selectedDept) {
        const filtered = allDivisions.filter(
          (div) => div.departmentId === selectedDept._id
        );
        setFilteredDivisions(filtered);
        // Auto-select first division if none selected
        if (filtered.length && !division) {
          setDivision(filtered[0].name);
        } else if (!filtered.length) {
          setDivision("");
        }
      }
    } else {
      setFilteredDivisions([]);
      setDivision("");
    }
  }, [department, departments, allDivisions]);

  // Pre-fill email and name from URL parameters
  useEffect(() => {
    const emailParam = searchParams.get("email");
    const nameParam = searchParams.get("name");
    if (emailParam) setEmail(emailParam);
    if (nameParam) setName(nameParam);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessageOnInteraction();

    // Validations
    if (!name || !cidNumber || !designation || !phoneNumber || !email || !department || !division) {
      setInlineMessage({ text: "All fields are required", type: "error" });
      return;
    }
    if (cidNumber.length !== 11 || !/^\d{11}$/.test(cidNumber)) {
      setInlineMessage({ text: "CID Number must be exactly 11 digits", type: "error" });
      return;
    }
    if (password !== confirmPassword) {
      setInlineMessage({ text: "Passwords do not match", type: "error" });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          cidNumber,
          designation,
          phoneNumber,
          department,
          division,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setInlineMessage({ text: data.error || "Signup failed", type: "error" });
        setLoading(false);
        return;
      }

      // Success
      setInlineMessage({
        text: "Registration submitted successfully! Redirecting to login...",
        type: "success",
      });
      setLoading(false);

      // Redirect after 2 seconds
      setTimeout(() => {
        const loginPath = returnTo
          ? `/login?returnTo=${encodeURIComponent(returnTo)}`
          : "/login";
        router.push(loginPath);
      }, 2000);
    } catch {
      setInlineMessage({ text: "Server error. Please try again.", type: "error" });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4 py-6">
      <div className="w-full max-w-md">
        {/* Card */}
        <div
          className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-2xl"
          onClick={clearMessageOnInteraction}
        >
          {/* Title */}
          <div className="text-center pt-6 pb-6 px-6">
            <h1 className="text-lg font-semibold text-black">Sign up to get started</h1>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-5 px-6 pb-6" onSubmit={handleSubmit}>
            {/* Personal Information Section */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Personal Information
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="cid" className="block text-sm font-medium text-gray-700 mb-1">
                    CID Number
                  </label>
                  <input
                    id="cid"
                    type="text"
                    placeholder="11-digit CID number"
                    value={cidNumber}
                    maxLength={11}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "");
                      setCidNumber(value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="designation" className="block text-sm font-medium text-gray-700 mb-1">
                    Designation
                  </label>
                  <input
                    id="designation"
                    type="text"
                    placeholder="Your job title"
                    value={designation}
                    onChange={(e) => {
                      setDesignation(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="Contact number"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>
            </div>

            {/* Organization Details Section */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Organization Details
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                    Department
                  </label>
                  <select
                    id="department"
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 bg-white"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="division" className="block text-sm font-medium text-gray-700 mb-1">
                    Division
                  </label>
                  <select
                    id="division"
                    value={division}
                    onChange={(e) => {
                      setDivision(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    disabled={!department || filteredDivisions.length === 0}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    <option value="">
                      {!department
                        ? "Select Department First"
                        : filteredDivisions.length === 0
                        ? "No divisions found"
                        : "Select Division"}
                    </option>
                    {filteredDivisions.map((d) => (
                      <option key={d._id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Account Security Section */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Account Security
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      clearMessageOnInteraction();
                    }}
                    className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-all duration-200 cursor-pointer shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 mt-2 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {loading ? "Signing up..." : "Sign Up"}
            </button>
          </form>

          {/* Inline Message (error / success) */}
          {inlineMessage && (
            <div className="px-6 pb-4">
              <p
                className={`text-center text-sm py-2 rounded-lg ${
                  inlineMessage.type === "error"
                    ? "text-red-500 bg-red-50"
                    : "text-green-700 bg-green-50"
                }`}
              >
                {inlineMessage.text}
              </p>
            </div>
          )}

          {/* Links */}
          <div className="px-6 pb-6 space-y-3 text-center">
            <p className="text-sm text-gray-500">
              Already have an account?{" "}
              <a
                href={
                  returnTo
                    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
                    : "/login"
                }
                className="text-black font-medium hover:underline transition"
              >
                Login
              </a>
            </p>
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} Anti-Corruption Commission
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="bg-white p-6 rounded-xl shadow-md text-black">Loading...</div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}