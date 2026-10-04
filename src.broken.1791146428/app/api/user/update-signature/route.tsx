import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { signature, initials, initialSignature } = body;

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    // ─── External signers: no-op (their signature is stored on the meeting) ──
    if (decoded.type === "document-signing") {
      return NextResponse.json({ success: true, external: true });
    }

    const { db } = await connectToDatabase();

    const updateData: any = {};
    if (signature) updateData.signature = signature;
    if (initialSignature) updateData.initialSignature = initialSignature;
    else if (initials) updateData.initialSignature = initials;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No signature data provided" },
        { status: 400 }
      );
    }

    await db
      .collection("users")
      .updateOne({ _id: new ObjectId(decoded.id) }, { $set: updateData });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update signature error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}