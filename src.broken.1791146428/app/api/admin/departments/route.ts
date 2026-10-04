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

// GET /api/admin/departments - List all departments
export async function GET(req: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    // Get all departments sorted by name
    const departments = await db.collection("departments")
      .find({ isActive: true })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({ departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    return NextResponse.json(
      { error: "Failed to fetch departments" },
      { status: 500 }
    );
  }
}

// POST /api/admin/departments - Create new department
export async function POST(req: Request) {
  try {
    const decoded = await authenticate(req);
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    // Verify admin
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { name } = await req.json();
    
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Department name is required" },
        { status: 400 }
      );
    }

    // Check if department already exists
    const existing = await db.collection("departments").findOne({ 
      name: name.trim(),
      isActive: true 
    });
    
    if (existing) {
      return NextResponse.json(
        { error: "Department already exists" },
        { status: 400 }
      );
    }

    const result = await db.collection("departments").insertOne({
      name: name.trim(),
      isActive: true,
      createdAt: new Date(),
    });

    return NextResponse.json({
      message: "Department created successfully",
      departmentId: result.insertedId,
    });
  } catch (error: any) {
    console.error("Error creating department:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to create department" },
      { status: 500 }
    );
  }
}
