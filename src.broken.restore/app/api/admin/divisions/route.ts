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

// GET /api/admin/divisions - List all divisions (optionally filtered by department)
export async function GET(req: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    // Get departmentId from query params if provided
    const { searchParams } = new URL(req.url);
    const departmentId = searchParams.get("departmentId");
    
    // Build query
    const query: any = { isActive: true };
    if (departmentId) {
      query.departmentId = new ObjectId(departmentId);
    }
    
    // Get all divisions sorted by name
    const divisions = await db.collection("divisions")
      .find(query)
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({ divisions });
  } catch (error) {
    console.error("Error fetching divisions:", error);
    return NextResponse.json(
      { error: "Failed to fetch divisions" },
      { status: 500 }
    );
  }
}

// POST /api/admin/divisions - Create new division
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

    const { name, departmentId } = await req.json();
    
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Division name is required" },
        { status: 400 }
      );
    }

    if (!departmentId) {
      return NextResponse.json(
        { error: "Department is required" },
        { status: 400 }
      );
    }

    // Verify department exists
    const department = await db.collection("departments").findOne({ 
      _id: new ObjectId(departmentId),
      isActive: true 
    });
    
    if (!department) {
      return NextResponse.json(
        { error: "Invalid department" },
        { status: 400 }
      );
    }

    // Check if division already exists under this department
    const existing = await db.collection("divisions").findOne({ 
      name: name.trim(),
      departmentId: new ObjectId(departmentId),
      isActive: true 
    });
    
    if (existing) {
      return NextResponse.json(
        { error: "Division already exists under this department" },
        { status: 400 }
      );
    }

    const result = await db.collection("divisions").insertOne({
      name: name.trim(),
      departmentId: new ObjectId(departmentId),
      isActive: true,
      createdAt: new Date(),
    });

    return NextResponse.json({
      message: "Division created successfully",
      divisionId: result.insertedId,
    });
  } catch (error: any) {
    console.error("Error creating division:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to create division" },
      { status: 500 }
    );
  }
}
