import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { isOTPExpired } from "@/lib/otp-helpers";

const MAX_OTP_ATTEMPTS = 3;

export async function POST(req: NextRequest) {
  try {
    const { userId, otp } = await req.json();

    if (!userId || !otp) {
      return NextResponse.json(
        { error: "User ID and OTP required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });

    if (!user || !user.loginOtp) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    // Check expiry
    if (isOTPExpired(user.loginOtp.expiresAt)) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $unset: { loginOtp: "" } }
      );
      return NextResponse.json(
        { error: "OTP expired. Please login again" },
        { status: 400 }
      );
    }

    // Check attempts
    if (user.loginOtp.attempts >= MAX_OTP_ATTEMPTS) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $unset: { loginOtp: "" } }
      );
      return NextResponse.json(
        { error: "Too many attempts. Please login again" },
        { status: 400 }
      );
    }

    // Verify OTP
    if (user.loginOtp.code !== otp) {
      await db.collection("users").updateOne(
        { _id: user._id },
        { $inc: { "loginOtp.attempts": 1 } }
      );
      return NextResponse.json(
        { error: "Invalid OTP" },
        { status: 401 }
      );
    }

    // OTP valid - clear it and generate JWT
    await db.collection("users").updateOne(
      { _id: user._id },
      { $unset: { loginOtp: "" } }
    );

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, isAdmin: user.isAdmin || false },
      process.env.JWT_SECRET!,
      { expiresIn: "8h" }
    );

    return NextResponse.json({
      success: true,
      token,
      isAdmin: user.isAdmin || false,
    });

  } catch (error) {
    console.error("OTP verification error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}
