import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { verifyAdmin } from "@/lib/admin-auth";
import { ObjectId } from "mongodb";

export async function POST(req: Request) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.valid) {
      return NextResponse.json({ error: adminCheck.error }, { status: 403 });
    }

    const body = await req.json();
    const { userId, isActive } = body;

    if (!userId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: "User ID and isActive status are required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Check if user exists
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent admin from deactivating themselves
    if (adminCheck.userId === userId && !isActive) {
      return NextResponse.json({ error: "Cannot deactivate your own admin account" }, { status: 400 });
    }

    // Update user status
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { isActive } }
    );

    return NextResponse.json({ 
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      isActive 
    });
  } catch (error) {
    console.error("Error toggling user status:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
