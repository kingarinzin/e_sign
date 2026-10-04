import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1] || null;
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

async function authenticate(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("No token");
  return jwt.verify(token, requireJwtSecret()) as any;
}

export async function GET(req: Request) {
  try {
    const decoded = await authenticate(req);
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    // Verify admin
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get all departments
    const departments = await db.collection("departments")
      .find({})
      .sort({ name: 1 })
      .toArray();

    // Get all active divisions
    const divisions = await db.collection("divisions")
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();

    // Get all approved users (regardless of isActive)
    const users = await db.collection("users")
      .find({ 
        isApproved: true
      })
      .project({
        _id: 1,
        name: 1,
        email: 1,
        department: 1,
        division: 1,
        designation: 1,
        isActive: 1,
        isApproved: 1
      })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({
      departments,
      divisions,
      users
    });
  } catch (error: any) {
    console.error("Error fetching data check:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
