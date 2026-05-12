import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { verifyAdmin } from "@/lib/admin-auth";
const nodemailer = require("nodemailer");

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

export async function POST(req: Request) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.valid) {
      return NextResponse.json({ error: adminCheck.error }, { status: 403 });
    }

    const { userId, action } = await req.json(); // action: 'approve' or 'reject'

    if (!userId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Get user info before updating
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get admin info
    const admin = await db.collection("users").findOne({ _id: new ObjectId(adminCheck.userId) });

    const updateData = {
      isApproved: action === 'approve',
      approvalStatus: action === 'approve' ? 'approved' : 'rejected',
      approvedBy: new ObjectId(adminCheck.userId),
      approvedAt: new Date(),
    };

    // Update user status
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Send email notification to user
    try {
      const transporter = createTransporter();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const userName = user.name || user.email.split("@")[0];

      if (action === "approve") {
        // Approval email
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: "Account Approved - Welcome to E-Sign!",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #10b981;">Account Approved! 🎉</h2>
              <p>Hi ${userName},</p>
              <p>Great news! Your E-Sign account has been approved by ${admin?.name || "an administrator"}.</p>
              <p>You can now log in and start using E-Sign to create and sign documents.</p>
              <a href="${appUrl}/login" 
                 style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">
                Login to Your Account
              </a>
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                If you have any questions, please contact your administrator.
              </p>
            </div>
          `,
        });
      } else {
        // Rejection email
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: "Account Registration Update",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ef4444;">Registration Not Approved</h2>
              <p>Hi ${userName},</p>
              <p>We regret to inform you that your E-Sign account registration was not approved at this time.</p>
              <p>If you believe this was a mistake or have questions, please contact your administrator.</p>
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                Thank you for your interest in E-Sign.
              </p>
            </div>
          `,
        });
      }
    } catch (emailError) {
      console.error("Failed to send user notification email:", emailError);
    }

    return NextResponse.json({ 
      message: `User ${action === 'approve' ? 'approved' : 'rejected'} successfully. Notification email sent to ${user.email}.`
    });
  } catch (error) {
    console.error("Error approving user:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
