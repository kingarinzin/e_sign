import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch (jwtErr) {
      console.error("JWT Verification Error:", jwtErr);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { db } = await connectToDatabase();

    const user = await db.collection("users").findOne(
      { _id: new ObjectId(decoded.id) },
      { projection: { password: 0 } } // hide password
    );

    // Return the user object, which now includes signature/initialSignature
    return NextResponse.json(user);
  } catch (error) {
    console.error("Profile GET error:", error);
    return NextResponse.json({ error: "Fetch failed" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch (jwtErr) {
      console.error("JWT Verification Error:", jwtErr);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // ─── Accept signature fields ──────────────────────────────────
    const { name, department, division, signature, initialSignature } = await req.json();

    if (name !== undefined && name.trim().length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    // Build update object dynamically
    const updateFields: any = {};
    if (name !== undefined) updateFields.name = name.trim();
    if (department !== undefined) updateFields.department = department || null;
    if (division !== undefined) updateFields.division = division || null;
    if (signature !== undefined) updateFields.signature = signature || null;
    if (initialSignature !== undefined) updateFields.initialSignature = initialSignature || null;

    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(decoded.id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch updated user
    const updatedUser = await db.collection("users").findOne(
      { _id: new ObjectId(decoded.id) },
      { projection: { password: 0 } }
    );

    return NextResponse.json({
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}