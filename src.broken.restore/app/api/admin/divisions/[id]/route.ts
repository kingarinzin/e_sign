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

// PUT /api/admin/divisions/:id - Update division
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
      return NextResponse.json({ error: "Invalid division ID" }, { status: 400 });
    }

    const { name, departmentId } = await req.json();
    
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Division name is required" },
        { status: 400 }
      );
    }

    // Build update object
    const updateObj: any = { 
      name: name.trim(), 
      updatedAt: new Date() 
    };

    // If departmentId is provided, verify and update it
    if (departmentId) {
      if (!ObjectId.isValid(departmentId)) {
        return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
      }

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

      updateObj.departmentId = new ObjectId(departmentId);
    }

    // Check if another division with same name exists under the same department
    const existingQuery: any = { 
      name: name.trim(),
      isActive: true,
      _id: { $ne: new ObjectId(id) }
    };
    
    if (departmentId) {
      existingQuery.departmentId = new ObjectId(departmentId);
    }
    
    const existing = await db.collection("divisions").findOne(existingQuery);
    
    if (existing) {
      return NextResponse.json(
        { error: "Division name already exists under this department" },
        { status: 400 }
      );
    }

    const result = await db.collection("divisions").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateObj }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Division not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Division updated successfully" });
  } catch (error: any) {
    console.error("Error updating division:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to update division" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/divisions/:id - Delete division (soft delete)
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
      return NextResponse.json({ error: "Invalid division ID" }, { status: 400 });
    }

    // Soft delete by setting isActive to false
    const result = await db.collection("divisions").updateOne(
      { _id: new ObjectId(id) },
      { $set: { isActive: false, deletedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Division not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Division deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting division:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to delete division" },
      { status: 500 }
    );
  }
}
