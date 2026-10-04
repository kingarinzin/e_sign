"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const returnTo = searchParams.get("returnTo");
  const expired = searchParams.get("expired");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.requiresOtp) {
          // Regular user - redirect to OTP verification
          router.push(`/verify-login-otp?userId=${data.userId}&email=${encodeURIComponent(data.email)}`);
        } else {
          // Admin - direct login without OTP
          localStorage.setItem("token", data.token);
          localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
          router.push("/admin/pending-users");
        }
      } else {
        setMessage(data.error || "Login failed");
      }
    } catch (err) {
      setMessage("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#00083d]">
      {/* Card */}
      <div className="bg-white shadow-2xl border border-gray-200 rounded-3xl p-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center items-center mb-6">
          <img src="/logo.png" alt="e-Sign Logo" className="h-16 w-auto" />
        </div>
        
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Welcome Back</h1>
          <p className="text-gray-500 mt-1">Sign in to your account</p>
        </div>

        {/* Session Expired Message */}
        {expired === "true" && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4 text-sm">
            <strong>Session Expired:</strong> Your session has expired. Please log in again.
          </div>
        )}

        {/* Form */}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            className="p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00083d] transition"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
            className="p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00083d] transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="p-3 bg-[#00083d] text-white rounded-xl font-semibold hover:bg-[#00083d]/90 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>

        {/* Error message */}
        {message && <p className="text-center mt-4 text-red-500">{message}</p>}

        {/* Forgot Password link */}
        <p className="text-center mt-4 text-sm">
          <a href="/forgot-password" className="text-[#00083d] hover:underline">
            Forgot Password?
          </a>
        </p>

        {/* Signup link */}
        <p className="text-center mt-4 text-sm text-gray-500">
          Don’t have an account?{" "}
          <a href="/signup" className="text-[#00083d] hover:underline">
            Sign Up
          </a>
        </p>
        {/* Copyright */}
        <p className="text-center mt-6 text-xs text-gray-400">
          © {new Date().getFullYear()} Anti-Corruption Commission
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#00083d]">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
