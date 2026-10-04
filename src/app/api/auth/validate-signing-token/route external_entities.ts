import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import clientPromise from "@/lib/mongodb";

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export async function POST(req: Request) {
  try {
    const { token, meetingId } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Verify the signing token
    const decoded: any = jwt.verify(token, requireJwtSecret());

    // Check if it's a valid signing token
    if (decoded.type !== "document-signing") {
      return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
    }

    // Verify meeting ID matches
    if (meetingId && decoded.meetingId !== meetingId) {
      return NextResponse.json({ error: "Token does not match document" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Check if user with this email exists
    const user = await db.collection("users").findOne({ 
      email: decoded.email 
    });

    if (user) {
      // User exists! Generate a regular auth token for auto-login
      const authToken = jwt.sign(
        { id: user._id.toString(), email: user.email },
        requireJwtSecret(),
        { expiresIn: "7d" }
      );

      return NextResponse.json({
        hasAccount: true,
        authToken,
        email: decoded.email,
        name: decoded.name,
        userId: user._id.toString(),
      });
    } else {
      // No account - they need to sign up
      return NextResponse.json({
        hasAccount: false,
        email: decoded.email,
        name: decoded.name,
      });
    }
  } catch (err: any) {
    console.error("Token validation error:", err);
    
    if (err.name === "TokenExpiredError") {
      return NextResponse.json(
        { error: "Signing link has expired" },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }
}
