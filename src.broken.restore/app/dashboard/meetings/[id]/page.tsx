"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Participant {
  name: string;
  email: string;
  signed?: boolean;
}

interface Meeting {
  _id: string;
  title: string;
  date: string;
  description: string;
  participants: Participant[];
  fileName?: string;
  filePath?: string;
  status: "Draft" | "Prepared" | "Sent" | "Signed";
}

export default function ViewMeetingPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchMeeting() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/meetings/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();

        if (res.ok) {
          setMeeting(data.meeting);
        } else {
          setMessage(data.error || "Failed to load meeting");
        }
      } catch (err) {
        console.error(err);
        setMessage("Server error");
      } finally {
        setLoading(false);
      }
    }

    fetchMeeting();
  }, [id]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!meeting) return <p className="p-6 text-red-500">{message || "Meeting not found"}</p>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-gray-100 p-6">
      <div className="bg-white shadow-2xl rounded-3xl p-8 w-full max-w-2xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">{meeting.title}</h2>
        <p className="mb-2"><strong>Date:</strong> {new Date(meeting.date).toLocaleDateString()}</p>
        <p className="mb-4"><strong>Status:</strong> {meeting.status}</p>
        <p className="mb-4"><strong>Description:</strong> {meeting.description}</p>

        {meeting.filePath && (
          <p className="mb-4">
            <strong>File:</strong>{" "}
            <a href={meeting.filePath} target="_blank" className="text-indigo-600 hover:underline">
              {meeting.fileName}
            </a>
          </p>
        )}

        <div className="mb-4">
          <h3 className="font-semibold mb-2">Participants</h3>
          <ul className="list-disc pl-5">
            {meeting.participants.map((p) => (
              <li key={p.email}>
                {p.name} ({p.email}) {p.signed ? "- Signed" : "- Pending"}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-gray-500 text-white py-2 px-4 rounded-xl hover:bg-gray-600 transition cursor-pointer"
          >
            Back to Dashboard
          </button>
          {meeting.status === "Draft" && (
            <button
              onClick={() => router.push(`/dashboard/meetings/${id}/prepare`)}
              className="bg-blue-500 text-white py-2 px-4 rounded-xl hover:bg-blue-600 transition cursor-pointer"
            >
              Prepare for Signing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
