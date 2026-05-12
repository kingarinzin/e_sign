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
    secure: false, // STARTTLS
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

    const { signature, signaturePositions } = await req.json();

    // Validate signature is not empty
    if (!signature || typeof signature !== 'string' || signature.trim().length === 0) {
      return NextResponse.json({ error: "Valid signature is required" }, { status: 400 });
    }

    // Additional validation - check if it looks like a data URL
    if (!signature.startsWith('data:image/')) {
      return NextResponse.json({ error: "Invalid signature format" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Get user info
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch the meeting
    const meeting = await db.collection("meetings").findOne({
      _id: new ObjectId(meetingId),
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Find current user in participants
    const participantIndex = meeting.participants.findIndex(
      (p: any) => p.email.toLowerCase() === user.email.toLowerCase()
    );

    if (participantIndex === -1) {
      return NextResponse.json(
        { error: "You are not a participant in this document" },
        { status: 403 }
      );
    }

    const participant = meeting.participants[participantIndex];

    // Check if already signed
    if (participant.signed) {
      return NextResponse.json(
        { error: "You have already signed this document" },
        { status: 400 }
      );
    }

    // Check signing mode
    const signingMode = meeting.signingMode || "sequential";

    // Check if it's their turn (only for sequential mode and signers)
    if (signingMode === "sequential" && participant.role === "Signer" && !participant.isCurrent) {
      return NextResponse.json(
        { error: "It's not your turn to sign yet" },
        { status: 400 }
      );
    }

    // Update participant as signed
    meeting.participants[participantIndex].signed = true;
    meeting.participants[participantIndex].signedAt = new Date();
    meeting.participants[participantIndex].signature = signature;
    meeting.participants[participantIndex].signaturePositions = signaturePositions || [];
    meeting.participants[participantIndex].isCurrent = false;

    let allSigned = false;
    let meetingStatus = meeting.status;
    
    // Check if all signers have signed
    const signers = meeting.participants.filter((p: any) => p.role === "Signer");
    allSigned = signers.every((s: any) => s.signed);

    if (signingMode === "sequential" && !allSigned) {
      // SEQUENTIAL MODE: Find next signer
      const currentSignerOrder = participant.order || 0;
      const nextSigner = signers.find(
        (p: any) => !p.signed && p.order > currentSignerOrder
      );

      if (nextSigner) {
        // Set next signer as current
        const nextIndex = meeting.participants.findIndex(
          (p: any) => p.email === nextSigner.email
        );
        meeting.participants[nextIndex].isCurrent = true;

        // Update meeting in database FIRST before sending email
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

        // Fetch organizer details for email
        const organizer = await db.collection("users").findOne({
          _id: new ObjectId(meeting.organizerId),
        });
        const organizerName = organizer?.name || "Document Organizer";
        const organizerEmail = organizer?.email || "";

        // Send email to next signer
        try {
          const transporter = createTransporter();
          
          // Generate signing token for the next participant
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
          
          const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign/${meetingId}?token=${signingToken}`;
          const previousSignerName = participant.name || user.name || "A participant";

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
                  <strong>From:</strong> ${organizerName}${organizerEmail ? ` (${organizerEmail})` : ''}<br>
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
      // PARALLEL MODE: Just update meeting, no need to notify next signer
      // OR Sequential mode and all signed
      
      if (allSigned) {
        meetingStatus = "Completed";
                // Update meeting status to Completed
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
                // Send completion email to organizer
        try {
          const organizer = await db.collection("users").findOne({
            _id: new ObjectId(meeting.organizerId),
          });

          if (organizer) {
            const transporter = createTransporter();
            const viewUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/view/${meetingId}`;

            await transporter.sendMail({
              from: process.env.EMAIL_USER,
              to: organizer.email,
              subject: `All Signatures Collected: "${meeting.title}"`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #10B981;">Document Fully Signed!</h2>
                  <p>Hello ${organizer?.name || 'there'},</p>
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
        // Not all signed yet, but no next signer - shouldn't happen but update DB just in case
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
