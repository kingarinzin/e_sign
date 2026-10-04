"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import dynamic from "next/dynamic";

const SigningView = dynamic<{
  meeting: any;
  meetingId: string;
  currentUser: any;
  signingToken: string | null;
}>(() => import("./SigningView"), {
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-[#f8f9fc]">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  ),
});

export default function SignDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [signingToken, setSigningToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function checkAccessAndFetchData() {
      try {
        let tokenForApi: string | null = null;
        let externalUser: any = null;

        // ─── Step 1: Handle signing token from URL if present ──────
        const urlSigningToken = searchParams.get("token");

        if (urlSigningToken) {
          const tokenRes = await fetch("/api/auth/validate-signing-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: urlSigningToken, meetingId: id }),
          });

          if (!tokenRes.ok) {
            const errorData = await tokenRes.json();
            setError(errorData.error || "Invalid or expired signing link");
            setLoading(false);
            return;
          }

          const tokenData = await tokenRes.json();

          if (tokenData.hasAccount) {
            // Internal user with account — auto-login via localStorage
            localStorage.setItem("token", tokenData.authToken);
            tokenForApi = tokenData.authToken;
          } else {
            // External user — keep token in memory only
            externalUser = {
              name: tokenData.name,
              email: tokenData.email,
              isExternal: true,
            };
            tokenForApi = tokenData.authToken;
            setSigningToken(tokenData.authToken);
            setCurrentUser(externalUser);
          }
        }

        // ─── Step 2: Fallback to localStorage for internal users ──
        if (!tokenForApi) {
          const stored = localStorage.getItem("token");
          if (!stored) {
            router.push(`/login?returnTo=/sign/${id}`);
            return;
          }
          tokenForApi = stored;
        }

        // ─── Step 3: Fetch the meeting ─────────────────────────────
        const meetingRes = await fetch(`/api/meetings/${id}`, {
          headers: { Authorization: `Bearer ${tokenForApi}` },
        });

        if (!meetingRes.ok) {
          setError("Document not found");
          setLoading(false);
          return;
        }

        const meetingData = await meetingRes.json();
        const mtg = meetingData.meeting || meetingData;

        // ─── Step 4: Ensure we have a current user ─────────────────
        if (!currentUser) {
          const userRes = await fetch("/api/user/profile", {
            headers: { Authorization: `Bearer ${tokenForApi}` },
          });

          if (!userRes.ok) {
            localStorage.removeItem("token");
            router.push(`/login?returnTo=/sign/${id}`);
            return;
          }

          const userData = await userRes.json();
          setCurrentUser(userData);
          externalUser = userData;
        }

        const activeUser = externalUser || currentUser;

        // ─── Step 5: Verify participant ────────────────────────────
        const participant = mtg.participants?.find(
          (p: any) =>
            p.email.toLowerCase() === activeUser.email.toLowerCase()
        );

        if (!participant) {
          setError("You are not authorized to sign this document");
          setLoading(false);
          return;
        }

        // ─── Step 6: Turn check (sequential mode) ──────────────────
        if (participant.role === "Signer") {
          const signers = mtg.participants.filter(
            (p: any) => p.role === "Signer"
          );
          const isFirstSigner =
            signers[0]?.email.toLowerCase() ===
            activeUser.email.toLowerCase();

          if (
            participant.isCurrent === false ||
            (!participant.isCurrent && !isFirstSigner)
          ) {
            setError("It's not your turn yet. Please wait for the previous signer.");
            setLoading(false);
            return;
          }
        }

        if (participant.signed) {
          setError("You have already signed this document");
          setLoading(false);
          return;
        }

        setMeeting(mtg);
        setIsAuthenticated(true);
        setLoading(false);
      } catch (err) {
        console.error("Error:", err);
        setError("Failed to load document");
        setLoading(false);
      }
    }

    checkAccessAndFetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router, searchParams]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
            Loading Document...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-red-200 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Unable to Access Document
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated && meeting && currentUser) {
    return (
      <SigningView
        meeting={meeting}
        meetingId={id}
        currentUser={currentUser}
        signingToken={signingToken}
      />
    );
  }

  return null;
}