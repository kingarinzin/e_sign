"use client";

import Image from "next/image";
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
    setMessage("");

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
          let otpUrl = `/verify-login-otp?userId=${data.userId}&email=${encodeURIComponent(data.email)}`;
          if (returnTo) {
            otpUrl += `&returnTo=${encodeURIComponent(returnTo)}`;
          }
          router.push(otpUrl);
        } else {
          // Admin - direct login without OTP
          localStorage.setItem("token", data.token);
          localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
          
          if (returnTo) {
            router.push(returnTo);
          } else {
            router.push("/admin/pending-users");
          }
        }
      } else {
        setMessage(data.error || "Login failed");
      }
    } catch {
      setMessage("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Logo Section */}
          <div className="flex justify-center pt-4 pb-0">
            <Image
              src="/logo.png"
              alt="ACC Insights"
              width={280}
              height={120}
              className="block mt-4 mb-4"
              priority
            />
          </div>

          {/* Title */}
          <div className="text-center px-6">
            <h4 className="text-[25px] font-semibold text-gray-900 mt-0">
              Anti-Corruption Commission
            </h4>
            <p className="text-gray-500 text-sm mt-1">
              Sign in to your account
            </p>
          </div>

          {/* Session expired alert */}
          {expired === "true" && (
            <div className="mx-6 mt-4 bg-amber-50 border-l-4 border-amber-400 text-amber-700 px-4 py-3 rounded-md text-sm">
              <strong>Session Expired:</strong> Your session has expired. Please
              log in again.
            </div>
          )}

          {/* Form */}
          <form className="flex flex-col gap-5 px-6 pb-6 mt-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-all duration-200 cursor-pointer shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Error message */}
          {message && (
            <div className="px-6 pb-2">
              <p className="text-center text-red-500 text-sm bg-red-50 py-2 rounded-lg">
                {message}
              </p>
            </div>
          )}

          {/* Links */}
          <div className="px-6 pb-4 space-y-3 text-center">
            <p className="text-sm">
              <a href="/forgot-password" className="text-gray-600 hover:text-black hover:underline transition">
                Forgot Password?
              </a>
            </p>

            <p className="text-sm text-gray-500">
              Don&apos;t have an account?{" "}
              <a href="/signup" className="text-black font-medium hover:underline transition">
                Sign Up
              </a>
            </p>

            <p className="text-xs text-gray-400 pt-2">
              © {new Date().getFullYear()} Anti-Corruption Commission
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="bg-white p-6 rounded-xl shadow-md text-black">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}