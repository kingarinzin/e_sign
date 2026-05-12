"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import dynamic from "next/dynamic";

// Use dynamic import to avoid SSR issues with PDF rendering
const SigningView = dynamic<{
  meeting: any;
  meetingId: string;
  currentUser: any;
}>(() => import("./SigningView"), { 
  ssr: false,
  loading: () => (
    <div className="h-screen flex items-center justify-center bg-[#f8f9fc]">
      <Loader2 className="animate-spin text-blue-600" size={40} />
    </div>
  )
});

export default function SignDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication and authorization
  useEffect(() => {
    async function checkAccessAndFetchData() {
      try {
        // Check if there's a signing token in URL
        const signingToken = searchParams.get('token');
        
        if (signingToken) {
          // Validate the signing token
          const tokenRes = await fetch('/api/auth/validate-signing-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: signingToken, meetingId: id }),
          });

          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            
            if (tokenData.hasAccount) {
              // User has account - auto-login
              localStorage.setItem('token', tokenData.authToken);
              // Continue with authenticated flow below
            } else {
              // User doesn't have account - redirect to signup
              const signupUrl = `/signup?email=${encodeURIComponent(tokenData.email)}&name=${encodeURIComponent(tokenData.name || '')}&returnTo=/sign/${id}?token=${signingToken}`;
              router.push(signupUrl);
              return;
            }
          } else {
            const errorData = await tokenRes.json();
            setError(errorData.error || "Invalid or expired signing link");
            setLoading(false);
            return;
          }
        }

        // Get the meeting to check if user should have access
        const meetingRes = await fetch(`/api/meetings/${id}`);
        
        if (!meetingRes.ok) {
          setError("Document not found");
          setLoading(false);
          return;
        }

        const meetingData = await meetingRes.json();
        const mtg = meetingData.meeting || meetingData;

        // Now check if user is logged in
        const token = localStorage.getItem("token");
        
        if (!token) {
          // No token - redirect to login
          router.push(`/login?returnTo=/sign/${id}`);
          return;
        }

        // Get current user
        const userRes = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!userRes.ok) {
          // Invalid token, redirect to login
          localStorage.removeItem("token");
          router.push(`/login?returnTo=/sign/${id}`);
          return;
        }

        const userData = await userRes.json();
        setCurrentUser(userData);
        
        // Check if current user is a participant
        const participant = mtg.participants?.find(
          (p: any) => p.email.toLowerCase() === userData.email.toLowerCase()
        );

        if (!participant) {
          setError("You are not authorized to sign this document");
          setLoading(false);
          return;
        }

        // Check if it's their turn
        if (participant.role === "Signer") {
          // If isCurrent is not set, check if they are the first signer
          const signers = mtg.participants.filter((p: any) => p.role === "Signer");
          const isFirstSigner = signers[0]?.email.toLowerCase() === userData.email.toLowerCase();
          
          if (participant.isCurrent === false || (!participant.isCurrent && !isFirstSigner)) {
            setError("It's not your turn yet. Please wait for the previous signer.");
            setLoading(false);
            return;
          }
        }

        // Check if already signed
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
          <h2 className="text-xl font-bold text-gray-800 mb-2">Unable to Access Document</h2>
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

  if (isAuthenticated && meeting) {
    return <SigningView meeting={meeting} meetingId={id} currentUser={currentUser} />;
  }

  return null;
}
