import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
const nodemailer = require("nodemailer");
import { getUserIdVariants } from "@/lib/auth-helpers";

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

// Create email transporter
function createTransporter() {
  // Using Gmail
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
    const { organizerIdQuery } = getUserIdVariants(decoded.id);

    // Get signing mode from request body OR meeting data (defaults to sequential for backward compatibility)
    const body = await req.json().catch(() => ({}));
    
    if (!ObjectId.isValid(meetingId)) {
      return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Fetch the meeting    
    const meeting = await db.collection("meetings").findOne({
      _id: new ObjectId(meetingId),
      organizerId: organizerIdQuery,
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Use signingMode from request body, fallback to meeting data, then default to sequential
    const signingMode = body.signingMode || meeting.signingMode || "sequential";

    // Fetch organizer details
    const organizer = await db.collection("users").findOne({
      _id: new ObjectId(meeting.organizerId),
    });

    const organizerName = organizer?.name || "Document Organizer";
    const organizerEmail = organizer?.email || "";

    // Update status to "Sent" and add signing order
    const participants = meeting.participants.map((p: any, index: number) => ({
      ...p,
      signed: false,
      signedAt: null,
      order: index, // Sequential signing order
      isCurrent: signingMode === "sequential" ? index === 0 : true, // In parallel mode, all can sign
    }));

    await db.collection("meetings").updateOne(
      { _id: new ObjectId(meetingId) },
      {
        $set: {
          status: "Sent",
          participants,
          sentAt: new Date(),
          signingMode: signingMode,
          currentSignerIndex: signingMode === "sequential" ? 0 : undefined,
          updatedAt: new Date(),
        },
      }
    );

    // Send emails based on signing mode
    const signers = participants.filter((p: any) => p.role === "Signer");
    
    if (signingMode === "parallel") {
      // PARALLEL MODE: Send to all participants at once
      for (const signer of signers) {
        try {
          const transporter = createTransporter();
          
          // Generate signing token for the participant
          const signingToken = jwt.sign(
            {
              type: "document-signing",
              meetingId: meetingId,
              email: signer.email,
              name: signer.name,
            },
            requireJwtSecret(),
            { expiresIn: "30d" }
          );
          
          const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign/${meetingId}?token=${signingToken}`;

          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: signer.email,
            subject: `Action Required: Sign "${meeting.title}"`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Document Ready for Signature</h2>
                <p>Hello ${signer.name},</p>
                <p>You have been requested to sign the following document:</p>
                <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <strong>Document:</strong> ${meeting.title}<br>
                  <strong>From:</strong> ${organizerName}${organizerEmail ? ` (${organizerEmail})` : ''}<br>
                  <strong>Sent via:</strong> <span style="color: #6B7280;">E-Sign App</span>
                </div>
                <p><strong>Message:</strong></p>
                <p style="background: #F9FAFB; padding: 15px; border-left: 4px solid #4F46E5;">
                  ${meeting.description}
                </p>
                <div style="margin: 30px 0;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 30px 0;">
                    <tr>
                      <td bgcolor="#4F46E5" style="border-radius: 6px;">
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
              </div>
            `,
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${signer.email}:`, emailError);
        }
      }
      
      return NextResponse.json({ 
        message: "Document sent to all participants successfully",
        signingMode: "parallel"
      });
      
    } else {
      // SEQUENTIAL MODE: Send to first signer only (existing behavior)
      const firstSigner = signers[0];
      
      if (firstSigner) {
        try {
        const transporter = createTransporter();
        
        // Generate signing token for the participant
        const signingToken = jwt.sign(
          {
            type: "document-signing",
            meetingId: meetingId,
            email: firstSigner.email,
            name: firstSigner.name,
          },
          requireJwtSecret(),
          { expiresIn: "30d" } // Token valid for 30 days
        );
        
        const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/sign/${meetingId}?token=${signingToken}`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: firstSigner.email,
          subject: `Action Required: Sign "${meeting.title}"`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4F46E5;">Document Ready for Signature</h2>
              <p>Hello ${firstSigner.name},</p>
              <p>You have been requested to sign the following document:</p>
              <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <strong>Document:</strong> ${meeting.title}<br>
                <strong>From:</strong> ${organizerName}${organizerEmail ? ` (${organizerEmail})` : ''}<br>
                <strong>Sent via:</strong> <span style="color: #6B7280;">E-Sign App</span>
              </div>
              <p><strong>Message:</strong></p>
              <p style="background: #F9FAFB; padding: 15px; border-left: 4px solid #4F46E5;">
                ${meeting.description}
              </p>
              <div style="margin: 30px 0;">
		<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 30px 0;">
		  <tr>
		    <td bgcolor="#4F46E5" style="border-radius: 6px;">
		      <a href="${signingUrl}"
		        style="display:inline-block; padding:12px 30px; font-family: Arial, sans-serif; font-size:14px; color:#ffffff; text-decoration:none; border-radius:6px;">
		        Sign Document
		      </a>
		    </td>
		  </tr>
		</table>

		<p style="font-size: 12px; color: #6B7280;">
		  If the button doesn’t work, copy and paste this link:<br>
		  <a href="${signingUrl}" style="color:#4F46E5;">${signingUrl}</a>
		</p>

              </div>
              <p style="color: #6B7280; font-size: 14px;">
                If you don't have an account, you'll be able to create one when you click the link.
              </p>
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
              <p style="color: #9CA3AF; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Email sending error:", emailError);
        // Don't fail the request if email fails
      }
    }

    // Send notification emails to CC recipients
    const ccRecipients = participants.filter((p: any) => p.role === "CC");
    for (const cc of ccRecipients) {
      try {
        const transporter = createTransporter();
        const viewUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/view/${meetingId}`;

        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: cc.email,
          subject: `CC: "${meeting.title}" - Document in Progress`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4F46E5;">Document CC Notification</h2>
              <p>Hello ${cc.name},</p>
              <p>You have been CC'd on the following document:</p>
              <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <strong>Document:</strong> ${meeting.title}<br>
                <strong>From:</strong> ${organizerName}${organizerEmail ? ` (${organizerEmail})` : ''}<br>
                <strong>Sent via:</strong> <span style="color: #6B7280;">E-Sign App</span>
              </div>
              <p>The document is currently being signed by the participants.</p>
              <div style="margin: 30px 0;">
                <a href="${viewUrl}" style="background: #6B7280; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Document
                </a>
              </div>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("CC email sending error:", emailError);
      }
    }

    return NextResponse.json({
      message: "Document sent successfully",
      signingMode: signingMode,
      sentTo: signingMode === "parallel" ? "All participants" : (firstSigner?.email || "No signers"),
    });
    }
  } catch (err: any) {
    console.error("SEND ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
