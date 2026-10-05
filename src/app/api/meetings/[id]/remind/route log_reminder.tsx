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

const COOLDOWN_MINUTES = 15;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ─── 1. Auth ─────────────────────────────────────────────
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, requireJwtSecret());
    } catch (jwtErr) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { id } = await params;
    const meetingId = id;

    if (!ObjectId.isValid(meetingId)) {
      return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
    }

    // ─── 2. Optional: filter to specific emails ──────────────
    let emailsFilter: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.emails) && body.emails.length > 0) {
        emailsFilter = body.emails.map((e: string) => e.toLowerCase());
      }
    } catch {
      // No body — send to all unsigned
    }

    // ─── 3. Load meeting ─────────────────────────────────────
    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const meeting = await db.collection("meetings").findOne({
      _id: new ObjectId(meetingId),
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // ─── 4. Authorization: only the organizer ────────────────
    const organizerIdStr =
      typeof meeting.organizerId === "string"
        ? meeting.organizerId
        : meeting.organizerId?.toString();

    if (organizerIdStr !== decoded.id) {
      return NextResponse.json(
        { error: "Only the organizer can send reminders" },
        { status: 403 }
      );
    }

    // ─── 5. Only Sent documents can be reminded ──────────────
    if (meeting.status !== "Sent") {
      return NextResponse.json(
        {
          error: `Cannot send reminders for a document with status "${meeting.status}". Only "Sent" documents can be reminded.`,
        },
        { status: 400 }
      );
    }

    // ─── 6. Determine targets ────────────────────────────────
    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

    const details: Array<{
      email: string;
      status: "sent" | "skipped" | "failed";
      reason?: string;
      minutesLeft?: number;
    }> = [];

    let sentCount = 0;
    let skippedCount = 0;

    // Load organizer name for email
    const organizer = await db
      .collection("users")
      .findOne({ _id: new ObjectId(decoded.id) });
    const organizerName = organizer?.name || "Document Organizer";
    const organizerEmail = organizer?.email || "";

    // Snapshot participants for modification
    const updatedParticipants = [...meeting.participants];

    for (let i = 0; i < updatedParticipants.length; i++) {
      const p = updatedParticipants[i];

      // Only Signers (not CCs)
      if (p.role !== "Signer") continue;

      // Skip already-signed
      if (p.signed) continue;

      // If an email filter is provided, only process those emails
      if (
        emailsFilter &&
        !emailsFilter.includes(p.email.toLowerCase())
      ) {
        continue;
      }

      // ─── Cooldown check ────────────────────────────────────
      if (p.lastRemindedAt) {
        const lastReminded = new Date(p.lastRemindedAt).getTime();
        const elapsed = now - lastReminded;
        if (elapsed < cooldownMs) {
          const minutesLeft = Math.ceil((cooldownMs - elapsed) / 60000);
          details.push({
            email: p.email,
            status: "skipped",
            reason: "cooldown",
            minutesLeft,
          });
          skippedCount++;
          continue;
        }
      }

      // ─── Generate fresh signing token ──────────────────────
      let signingToken: string;
      try {
        signingToken = jwt.sign(
          {
            type: "document-signing",
            meetingId: meetingId,
            email: p.email,
            name: p.name,
          },
          requireJwtSecret(),
          { expiresIn: "30d" }
        );
      } catch (err) {
        console.error("Failed to sign token for", p.email, err);
        details.push({
          email: p.email,
          status: "failed",
          reason: "token_error",
        });
        continue;
      }

      const signingUrl = `${
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      }/sign/${meetingId}?token=${signingToken}`;

      // ─── Count of signers who completed (for social proof) ─
      const totalSigners = updatedParticipants.filter(
        (x: any) => x.role === "Signer"
      ).length;
      const signedSigners = updatedParticipants.filter(
        (x: any) => x.role === "Signer" && x.signed
      ).length;

      // ─── Send email ────────────────────────────────────────
      try {
        const transporter = createTransporter();

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: p.email,
          subject: `Reminder: Please sign "${meeting.title}"`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #DC2626;">Reminder: Signature Pending</h2>
              <p>Hello ${p.name},</p>
              <p>You haven't signed yet:</p>
              <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <strong>Document:</strong> ${meeting.title}<br>
                <strong>From:</strong> ${organizerName}${
            organizerEmail ? ` (${organizerEmail})` : ""
          }<br>
                <strong>Progress:</strong> ${signedSigners} of ${totalSigners} signers have completed<br>
                <strong>Sent via:</strong> <span style="color: #6B7280;">E-Sign App</span>
              </div>
              <p><strong>Message from sender:</strong></p>
              <p style="background: #F9FAFB; padding: 15px; border-left: 4px solid #4F46E5;">
                ${meeting.description || ""}
              </p>
              <div style="margin: 30px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 30px 0;">
                  <tr>
                    <td bgcolor="#DC2626" style="border-radius: 6px;">
                      <a href="${signingUrl}"
                        style="display:inline-block; padding:12px 30px; font-family: Arial, sans-serif; font-size:14px; color:#ffffff; text-decoration:none; border-radius:6px;">
                        Sign Document
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-size: 12px; color: #6B7280;">
                  If the button doesn't work, copy and paste this link:<br>
                  <a href="${signingUrl}" style="color:#4F46E5;">${signingUrl}</a>
                </p>
              </div>
              <p style="color: #6B7280; font-size: 13px;">
                If you've already signed this document, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
              <p style="color: #9CA3AF; font-size: 12px;">
                This is a reminder from the document organizer. If you believe this is an error, please contact ${organizerEmail}.
              </p>
            </div>
          `,
        });

        // Mark as reminded
        updatedParticipants[i] = {
          ...p,
          lastRemindedAt: new Date(),
        };

        details.push({ email: p.email, status: "sent" });
        sentCount++;
      } catch (emailErr: any) {
        console.error(`Reminder email failed for ${p.email}:`, emailErr);
        details.push({
          email: p.email,
          status: "failed",
          reason: "smtp_error",
        });
      }
    }

    // ─── 7. Persist lastRemindedAt ───────────────────────────
    if (sentCount > 0) {
      await db.collection("meetings").updateOne(
        { _id: new ObjectId(meetingId) },
        {
          $set: {
            participants: updatedParticipants,
            updatedAt: new Date(),
          },
        }
      );
    }

    return NextResponse.json({
      sent: sentCount,
      skipped: skippedCount,
      details,
    });
  } catch (err: any) {
    console.error("REMIND ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}