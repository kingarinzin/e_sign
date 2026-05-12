import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

// GET /api/user/by-email?email=user@example.com
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { error: "Email parameter is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    const user = await db.collection("users").findOne(
      { email: email.toLowerCase() },
      {
        projection: {
          password: 0, // Exclude password from response
          loginOtp: 0, // Exclude OTP data
        },
      }
    );

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Return user details for auto-fill
    return NextResponse.json({
      name: user.name || "",
      email: user.email,
      department: user.department || "",
      division: user.division || "",
      designation: user.designation || "",
      phoneNumber: user.phoneNumber || "",
    });
  } catch (error) {
    console.error("Error fetching user by email:", error);
    return NextResponse.json(
      { error: "Failed to fetch user details" },
      { status: 500 }
    );
  }
}
