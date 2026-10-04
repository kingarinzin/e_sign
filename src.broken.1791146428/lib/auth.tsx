import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export function verifyToken(req: Request): 
  { valid: true; decoded: { id: string; email: string } } | 
  { valid: false; message: string } 
{
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, message: "No token provided" };
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; email: string };
    return { valid: true, decoded };
  } catch (err) {
    return { valid: false, message: "Invalid token" };
  }
}

