import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { isOTPExpired } from "@/lib/otp-helpers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, otp, newPassword } = await req.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { error: "Email, OTP, and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");
    const users = db.collection("users");

    const user = await users.findOne({ email });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or OTP" },
        { status: 401 }
      );
    }

    // Check if OTP exists
    if (!user.resetPasswordOtp) {
      return NextResponse.json(
        { error: "No password reset request found. Please request a new code." },
        { status: 400 }
      );
    }

    // Verify OTP
    if (user.resetPasswordOtp !== otp) {
      return NextResponse.json(
        { error: "Invalid OTP" },
        { status: 401 }
      );
    }

    // Check OTP expiry
    if (isOTPExpired(user.resetPasswordOtpExpiry)) {
      return NextResponse.json(
        { error: "OTP has expired. Please request a new code." },
        { status: 401 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP fields
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
        },
        $unset: {
          resetPasswordOtp: "",
          resetPasswordOtpExpiry: "",
        },
      }
    );

    return NextResponse.json(
      { message: "Password reset successful. You can now login with your new password." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
