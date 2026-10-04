import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
const nodemailer = require("nodemailer");

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1] || null;
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded: any = jwt.verify(token, requireJwtSecret());
    const { id } = await params;
    const meetingId = id;

    if (!ObjectId.isValid(meetingId)) {
      return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
    }

    const {
      signature,
      signaturePositions,
      initialSignature,
      initialSignaturePositions,
    } = await req.json();

    const hasFullSignature =
      signature && typeof signature === "string" && signature.trim().length > 0;
    const hasInitialSignature =
      initialSignature &&
      typeof initialSignature === "string" &&
      initialSignature.trim().length > 0;

    if (!hasFullSignature && !hasInitialSignature) {
      return NextResponse.json(
        { error: "At least one signature (full or initial) is required" },
        { status: 400 }
      );
    }

    if (hasFullSignature && !signature.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Invalid full signature format" },
        { status: 400 }
      );
    }

    if (hasInitialSignature && !initialSignature.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Invalid initial signature format" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // ─── Resolve the signer's email + display name ─────────────────
    //    - internal token: { id } → look up user in DB
    //    - external token: { type: "document-signing", email, name }
    let signerEmail: string;
    let signerName: string;

    if (decoded.type === "document-signing") {
      signerEmail = decoded.email;
      signerName = decoded.name || decoded.email;
    } else {
      const user = await db
        .collection("users")
        .findOne({ _id: new ObjectId(decoded.id) });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      signerEmail = user.email;
      signerName = user.name || user.email;
    }

    const meeting = await db.collection("meetings").findOne({
      _id: new ObjectId(meetingId),
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const participantIndex = meeting.participants.findIndex(
      (p: any) => p.email.toLowerCase() === signerEmail.toLowerCase()
    );

    if (participantIndex === -1) {
      return NextResponse.json(
        { error: "You are not a participant in this document" },
        { status: 403 }
      );
    }

    const participant = meeting.participants[participantIndex];

    if (participant.signed) {
      return NextResponse.json(
        { error: "You have already signed this document" },
        { status: 400 }
      );
    }

    const signingMode = meeting.signingMode || "sequential";

    if (
      signingMode === "sequential" &&
      participant.role === "Signer" &&
      !participant.isCurrent
    ) {
      return NextResponse.json(
        { error: "It's not your turn to sign yet" },
        { status: 400 }
      );
    }

    // ─── Update participant ────────────────────────────────────────
    meeting.participants[participantIndex].signed = true;
    meeting.participants[participantIndex].signedAt = new Date();

    if (hasFullSignature) {
      meeting.participants[participantIndex].signature = signature;
      meeting.participants[participantIndex].signaturePositions =
        signaturePositions || [];
    } else {
      meeting.participants[participantIndex].signature = null;
      meeting.participants[participantIndex].signaturePositions = [];
    }

    if (hasInitialSignature) {
      meeting.participants[participantIndex].initialSignature = initialSignature;
      meeting.participants[participantIndex].initialSignaturePositions =
        initialSignaturePositions || [];
    } else {
      meeting.participants[participantIndex].initialSignature = null;
      meeting.participants[participantIndex].initialSignaturePositions = [];
    }

    meeting.participants[participantIndex].isCurrent = false;

    let allSigned = false;
    let meetingStatus = meeting.status;
    const signers = meeting.participants.filter(
      (p: any) => p.role === "Signer"
    );
    allSigned = signers.every((s: any) => s.signed);

    // ─── Email + status update ─────────────────────────────────────
    if (signingMode === "sequential" && !allSigned) {
      const currentSignerOrder = participant.order || 0;
      const nextSigner = signers.find(
        (p: any) => !p.signed && p.order > currentSignerOrder
      );

      if (nextSigner) {
        const nextIndex = meeting.participants.findIndex(
          (p: any) => p.email === nextSigner.email
        );
        meeting.participants[nextIndex].isCurrent = true;

        await db.collection("meetings").updateOne(
          { _id: new ObjectId(meetingId) },
          {
            $set: {
              participants: meeting.participants,
              status: meetingStatus,
              currentSignerIndex: nextIndex,
              updatedAt: new Date(),
            },
          }
        );

        const organizer = await db.collection("users").findOne({
          _id: new ObjectId(meeting.organizerId),
        });
        const organizerName = organizer?.name || "Document Organizer";
        const organizerEmail = organizer?.email || "";

        try {
          const transporter = createTransporter();
          const signingToken = jwt.sign(
            {
              type: "document-signing",
              meetingId: meetingId,
              email: nextSigner.email,
              name: nextSigner.name,
            },
            requireJwtSecret(),
            { expiresIn: "30d" }
          );
          const signingUrl = `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/sign/${meetingId}?token=${signingToken}`;
          const previousSignerName = signerName;

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: nextSigner.email,
            subject: `Action Required: Sign "${meeting.title}"`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Your Turn to Sign</h2>
                <p>Hello ${nextSigner.name},</p>
                <p>${previousSignerName} has signed the document. It's now your turn to sign:</p>
                <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <strong>Document:</strong> ${meeting.title}<br>
                  <strong>From:</strong> ${organizerName}${
              organizerEmail ? ` (${organizerEmail})` : ""
            }<br>
                  <strong>Sent via:</strong> <span style="color: #6B7280;">E-Sign App</span>
                </div>
                <div style="margin: 30px 0;">
                  <a href="${signingUrl}" style="background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    Sign Document
                  </a>
                </div>
              </div>
            `,
          });
        } catch (emailError) {
          console.error("Email error:", emailError);
        }
      }
    } else if (signingMode === "parallel" || allSigned) {
      if (allSigned) {
        meetingStatus = "Completed";
        await db.collection("meetings").updateOne(
          { _id: new ObjectId(meetingId) },
          {
            $set: {
              participants: meeting.participants,
              status: meetingStatus,
              updatedAt: new Date(),
            },
          }
        );

        // Notify organizer
        try {
          const organizer = await db.collection("users").findOne({
            _id: new ObjectId(meeting.organizerId),
          });

          if (organizer) {
            const transporter = createTransporter();
            const viewUrl = `${
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
            }/view/${meetingId}`;

            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: organizer.email,
              subject: `All Signatures Collected: "${meeting.title}"`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #10B981;">Document Fully Signed!</h2>
                  <p>Hello ${organizer?.name || "there"},</p>
                  <p>Great news! All participants have signed your document:</p>
                  <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <strong>Document:</strong> ${meeting.title}
                  </div>
                  <p>You can now review and download the completed document.</p>
                  <div style="margin: 30px 0;">
                    <a href="${viewUrl}" style="background: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                      View & Download Document
                    </a>
                  </div>
                </div>
              `,
            });
          }
        } catch (emailError) {
          console.error("Organizer notification error:", emailError);
        }
      } else {
        await db.collection("meetings").updateOne(
          { _id: new ObjectId(meetingId) },
          {
            $set: {
              participants: meeting.participants,
              status: meetingStatus,
              updatedAt: new Date(),
            },
          }
        );
      }
    }

    return NextResponse.json({
      message: allSigned
        ? "Document fully signed! The organizer has been notified."
        : "Signature submitted successfully. Next signer has been notified.",
      allSigned,
    });
  } catch (err: any) {
    console.error("SIGN ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}