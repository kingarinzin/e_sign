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

// PUT /api/admin/departments/:id - Update department
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = await authenticate(req);
    const { id } = await params;
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    // Verify admin
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
    }

    const { name } = await req.json();
    
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Department name is required" },
        { status: 400 }
      );
    }

    // Check if another department with same name exists
    const existing = await db.collection("departments").findOne({ 
      name: name.trim(),
      isActive: true,
      _id: { $ne: new ObjectId(id) }
    });
    
    if (existing) {
      return NextResponse.json(
        { error: "Department name already exists" },
        { status: 400 }
      );
    }

    const result = await db.collection("departments").updateOne(
      { _id: new ObjectId(id) },
      { $set: { name: name.trim(), updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Department updated successfully" });
  } catch (error: any) {
    console.error("Error updating department:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update department" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/departments/:id - Delete department (soft delete)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = await authenticate(req);
    const { id } = await params;
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    // Verify admin
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
    }

    // Soft delete by setting isActive to false
    const result = await db.collection("departments").updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive: false, deletedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Department deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting department:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to delete department" },
      { status: 500 }
    );
  }
}
