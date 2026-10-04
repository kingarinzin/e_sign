import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import nodemailer from "nodemailer";
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

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");
    const users = db.collection("users");

    const user = await users.findOne({ email });

    if (!user) {
      // Don't reveal if user exists or not for security
      return NextResponse.json(
        { message: "If an account exists with this email, you will receive a password reset code." },
        { status: 200 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    // Store OTP in user document
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordOtp: otp,
          resetPasswordOtpExpiry: otpExpiry,
        },
      }
    );

    // Send OTP email
    const transporter = createTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Code - e-Sign",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00083d;">Password Reset Request</h2>
          <p>You requested to reset your password for your e-Sign account.</p>
          <p>Your password reset code is:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="color: #666;">This code will expire in 5 minutes.</p>
          <p style="color: #666;">If you didn't request this, please ignore this email.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
      `,
    });

    return NextResponse.json(
      { message: "If an account exists with this email, you will receive a password reset code." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
