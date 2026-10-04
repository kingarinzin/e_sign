import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const adminCheck = await verifyAdmin(req);
    if (!adminCheck.valid) {
      return NextResponse.json({ error: adminCheck.error }, { status: 403 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const pendingUsers = await db.collection("users")
      .find({ approvalStatus: 'pending' })
      .project({ password: 0 }) // Don't send passwords
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ users: pendingUsers });
  } catch (error) {
    console.error("Error fetching pending users:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
