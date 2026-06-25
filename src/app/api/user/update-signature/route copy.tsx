import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  try {
    const { signature, initials } = await req.json();
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify token and get User ID
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    const { db } = await connectToDatabase();

    const updateData: any = {};
    if (signature) updateData.signature = signature;
    if (initials) updateData.initials = initials;

    await db.collection("users").updateOne(
      { _id: new ObjectId(decoded.id) },
      { $set: updateData }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}