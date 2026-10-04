"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, RefreshCw, Clock } from "lucide-react";

function VerifyLoginOTPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const email = searchParams.get("email");

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [inlineMessage, setInlineMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Auto-dismiss inline message after 3 seconds
  useEffect(() => {
    if (inlineMessage) {
      const timer = setTimeout(() => setInlineMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [inlineMessage]);

  useEffect(() => {
    if (!userId) {
      router.push("/login");
    }
  }, [userId, router]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setInlineMessage({
        text: "Please enter a 6-digit OTP",
        type: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, otp }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("isAdmin", data.isAdmin ? "true" : "false");
        
        setInlineMessage({
          text: "Login successful! Redirecting to dashboard...",
          type: "success",
        });

        setTimeout(() => {
          if (data.isAdmin) {
            router.push("/admin/pending-users");
          } else {
            router.push("/dashboard");
          }
        }, 1500);
      } else {
        setInlineMessage({
          text: data.error || "Invalid OTP",
          type: "error",
        });
        if (data.error?.includes("login again")) {
          setTimeout(() => router.push("/login"), 2000);
        }
      }
    } catch (err) {
      setInlineMessage({
        text: "Verification failed. Please try again.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      
      if (res.ok) {
        setTimeLeft(300); // Reset timer to 5 minutes
        setOtp(""); // Clear OTP input
        setInlineMessage({
          text: data.message || "OTP resent successfully",
          type: "success",
        });
      } else {
        setInlineMessage({
          text: data.error || "Failed to resend OTP",
          type: "error",
        });
      }
    } catch (err) {
      setInlineMessage({
        text: "Failed to resend OTP",
        type: "error",
      });
    } finally {
      setResendLoading(false);
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="text-gray-700" size={32} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Verify Your Login</h1>
          <p className="text-gray-500 mt-2">
            Enter the 6-digit code sent to
          </p>
          {email && (
            <p className="text-sm text-gray-600 font-medium mt-1">{email}</p>
          )}
        </div>

        {/* Inline Message Banner */}
        {inlineMessage && (
          <div
            className={`mb-4 p-3 rounded-md text-sm ${
              inlineMessage.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {inlineMessage.text}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl tracking-widest focus:ring-2 focus:ring-black focus:border-transparent transition-all duration-200"
              maxLength={6}
              autoFocus
            />
          </div>

          {/* Timer Display */}
          <div className={`flex items-center justify-center gap-2 text-sm ${
            timeLeft <= 60 ? "text-red-600" : "text-gray-600"
          }`}>
            <Clock size={16} />
            <span className="font-medium">
              {timeLeft > 0 ? (
                <>Code expires in {formatTime(timeLeft)}</>
              ) : (
                <span className="text-red-600">Code expired - please resend</span>
              )}
            </span>
          </div>

          <button
            type="submit"
            disabled={loading || otp.length !== 6 || timeLeft === 0}
            className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Verifying...
              </>
            ) : (
              "Verify & Login"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={handleResend}
            disabled={resendLoading}
            className={`text-sm flex items-center gap-2 mx-auto disabled:opacity-50 font-medium cursor-pointer transition ${
              timeLeft === 0 
                ? "text-red-600 hover:text-red-700" 
                : "text-gray-700 hover:text-black"
            }`}
          >
            {resendLoading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Resend OTP
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => router.push("/login")}
            className="text-gray-500 hover:text-gray-700 text-sm cursor-pointer transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyLoginOTPPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
          <div className="bg-white p-6 rounded-xl shadow-md text-black flex items-center gap-2">
            <Loader2 className="animate-spin" size={24} />
            <span>Loading...</span>
          </div>
        </div>
      }
    >
      <VerifyLoginOTPContent />
    </Suspense>
  );
}