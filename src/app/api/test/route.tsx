import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("e_sign_db");
    const collections = await db.collections();
    const names = collections.map(c => c.collectionName);
    return NextResponse.json({ collections: names });
  } catch (err) {
    return NextResponse.json({ error: err });
  }
}
