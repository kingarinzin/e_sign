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

// GET /api/user/by-department-division - Get users by department and/or division
export async function GET(req: Request) {
  try {
    await authenticate(req);
    
    const { searchParams } = new URL(req.url);
    const department = searchParams.get("department");
    const division = searchParams.get("division");
    
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    
    const query: any = { 
      isApproved: true,
      $or: [
        { isActive: true },
        { isActive: { $exists: false } }
      ]
    };
    
    // Use case-insensitive regex for matching
    if (department) {
      const trimmedDept = department.trim();
      query.department = { 
        $regex: new RegExp(`^${trimmedDept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      };
    }
    
    if (division) {
      const trimmedDiv = division.trim();
      query.division = { 
        $regex: new RegExp(`^${trimmedDiv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      };
    }
    
    const users = await db.collection("users")
      .find(query, {
        projection: {
          _id: 1,
          name: 1,
          email: 1,
          department: 1,
          division: 1,
          designation: 1,
          phoneNumber: 1,
          isApproved: 1,
          isActive: 1
        }
      })
      .sort({ name: 1 })
      .toArray();
    
    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("Error fetching users:", error);
    if (error.message === "No token") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
