import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { verifyAdmin } from "@/lib/admin-auth";
import { ObjectId } from "mongodb";

export async function DELETE(req: Request) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.valid) {
      return NextResponse.json({ error: adminCheck.error }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Check if user exists
    const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
    
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent admin from deleting themselves
    if (adminCheck.userId === userId) {
      return NextResponse.json({ error: "Cannot delete your own admin account" }, { status: 400 });
    }

    // Delete the user
    await db.collection("users").deleteOne({ _id: new ObjectId(userId) });

    return NextResponse.json({ 
      message: "User deleted successfully",
      deletedEmail: user.email 
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
