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

// POST /api/admin/cleanup - Clean up old data
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

    const { action } = await req.json();

    let result: any = {};

    if (action === "delete-all-departments") {
      // Delete ALL departments
      const deleteResult = await db.collection("departments").deleteMany({});
      result = {
        success: true,
        message: `Deleted all ${deleteResult.deletedCount} departments`,
        deletedCount: deleteResult.deletedCount
      };
    }
    else if (action === "delete-all-divisions") {
      // Delete ALL divisions
      const deleteResult = await db.collection("divisions").deleteMany({});
      result = {
        success: true,
        message: `Deleted all ${deleteResult.deletedCount} divisions`,
        deletedCount: deleteResult.deletedCount
      };
    }
    else if (action === "remove-unlinked-divisions") {
      // Remove divisions that don't have a departmentId
      const deleteResult = await db.collection("divisions").deleteMany({
        departmentId: { $exists: false }
      });
      result = {
        success: true,
        message: `Removed ${deleteResult.deletedCount} unlinked divisions`,
        deletedCount: deleteResult.deletedCount
      };
    }
    else if (action === "get-cleanup-info") {
      // Get counts of items that would be cleaned up
      const totalDepartments = await db.collection("departments").countDocuments({});
      const totalDivisions = await db.collection("divisions").countDocuments({});
      
      const unlinkedDivisionsCount = await db.collection("divisions").countDocuments({
        departmentId: { $exists: false }
      });

      // Get unlinked divisions list
      const unlinkedDivisions = await db.collection("divisions")
        .find({ departmentId: { $exists: false } })
        .toArray();

      result = {
        success: true,
        totalDepartments,
        totalDivisions,
        unlinkedDivisionsCount,
        unlinkedDivisions: unlinkedDivisions.map(d => d.name)
      };
    }
    else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error cleaning up data:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to clean up data" },
      { status: 500 }
    );
  }
}
