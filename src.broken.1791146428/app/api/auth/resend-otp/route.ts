import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import nodemailer from "nodemailer";
import { ObjectId } from "mongodb";
import { generateOTP, getOTPExpiry } from "@/lib/otp-helpers";

export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpiry = getOTPExpiry();

    await db.collection("users").updateOne(
      { _id: user._id },
      {
        $set: {
          loginOtp: {
            code: otpCode,
            expiresAt: otpExpiry,
            attempts: 0,
          },
        },
      }
    );

    // Send OTP email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"E-Sign Platform" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Login Verification Code (Resent)",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Login Verification</h2>
          <p>Hello ${user.name || 'User'},</p>
          <p>Your new verification code is:</p>
          <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="color: #1f2937; font-size: 36px; margin: 0; letter-spacing: 8px;">${otpCode}</h1>
          </div>
          <p style="color: #6b7280;">This code will expire in 5 minutes.</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "New OTP sent to your email",
    });

  } catch (error) {
    console.error("Resend OTP error:", error);
    return NextResponse.json(
      { error: "Failed to resend OTP" },
      { status: 500 }
    );
  }
}
