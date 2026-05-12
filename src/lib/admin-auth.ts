import jwt from "jsonwebtoken";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function verifyAdmin(req: Request): Promise<{ valid: true; userId: string } | { valid: false; error: string }> {
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader?.startsWith("Bearer ")) {
    return { valid: false, error: "No token provided" };
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string; isAdmin?: boolean };
    
    // Verify admin status in database
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.id) });

    if (!user || !user.isAdmin) {
      return { valid: false, error: "Unauthorized: Admin access required" };
    }

    return { valid: true, userId: decoded.id };
  } catch (err) {
    return { valid: false, error: "Invalid token" };
  }
}
