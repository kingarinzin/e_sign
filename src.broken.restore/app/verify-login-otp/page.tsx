"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail, RefreshCw, Clock } from "lucide-react";
import SuccessModal from "@/components/SuccessModal";

function VerifyLoginOTPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("userId");
  const email = searchParams.get("email");

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
  });

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
      setModalState({
        isOpen: true,
        title: "Invalid OTP",
        message: "Please enter a 6-digit OTP",
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
        
        setModalState({
          isOpen: true,
          title: "Login Successful",
          message: "Redirecting to dashboard...",
        });

        setTimeout(() => {
          if (data.isAdmin) {
            router.push("/admin/pending-users");
          } else {
            router.push("/dashboard");
          }
        }, 1500);
      } else {
        setModalState({
          isOpen: true,
          title: "Verification Failed",
          message: data.error || "Invalid OTP",
        });
        if (data.error?.includes("login again")) {
          setTimeout(() => router.push("/login"), 2000);
        }
      }
    } catch (err) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Verification failed. Please try again.",
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
      }
      
      setModalState({
        isOpen: true,
        title: res.ok ? "OTP Resent" : "Error",
        message: data.message || data.error,
      });
    } catch (err) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Failed to resend OTP",
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
    <div className="min-h-screen flex items-center justify-center bg-[#00083d] p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="text-blue-600" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Verify Your Login</h1>
          <p className="text-gray-600 mt-2">
            Enter the 6-digit code sent to
          </p>
          {email && (
            <p className="text-sm text-gray-500 font-medium mt-1">{email}</p>
          )}
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-center text-2xl tracking-widest focus:ring-2 focus:ring-[#00083d] focus:border-transparent"
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
            className="w-full bg-[#00083d] text-white py-3 rounded-xl font-semibold hover:bg-[#00083d]/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
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
            className={`text-sm flex items-center gap-2 mx-auto disabled:opacity-50 font-medium cursor-pointer ${
              timeLeft === 0 
                ? "text-red-600 hover:text-red-700" 
                : "text-[#00083d] hover:text-[#00083d]/80"
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
            className="text-gray-600 hover:text-gray-800 text-sm cursor-pointer"
          >
            Back to Login
          </button>
        </div>
      </div>

      <SuccessModal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        onClose={() => setModalState({ isOpen: false, title: "", message: "" })}
        showButton={modalState.title !== "Login Successful"}
      />
    </div>
  );
}

export default function VerifyLoginOTPPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#00083d]">
          <div className="text-white flex items-center gap-2">
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
