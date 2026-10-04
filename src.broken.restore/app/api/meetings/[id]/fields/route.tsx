import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getUserIdVariants } from "@/lib/auth-helpers";

export const runtime = "nodejs";

type FieldType = "signature" | "name" | "date";

type Field = {
  id: string;           // keep id so UI can remove/update reliably
  type: FieldType;
  page: number;         // 1-based page index
  xPct: number;         // 0..1
  yPct: number;         // 0..1
  wPct: number;         // 0..1
  hPct: number;         // 0..1
  recipientName?: string; // Name of recipient this field is assigned to
};

function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as any;
  } catch {
    return null;
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function isFieldType(t: any): t is FieldType {
  return t === "signature" || t === "name" || t === "date";
}

function normalizeField(raw: any): Field | null {
  if (!raw || typeof raw !== "object") return null;

  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : crypto.randomUUID();

  const page = Number(raw.page);
  const xPct = Number(raw.xPct);
  const yPct = Number(raw.yPct);
  const wPct = Number(raw.wPct);
  const hPct = Number(raw.hPct);

  if (!isFieldType(raw.type)) return null;
  if (!Number.isFinite(page) || page < 1) return null;

  if (![xPct, yPct, wPct, hPct].every((v) => Number.isFinite(v))) return null;

  // Clamp to sane bounds
  return {
    id,
    type: raw.type,
    page,
    xPct: clamp01(xPct),
    yPct: clamp01(yPct),
    wPct: clamp01(wPct),
    hPct: clamp01(hPct),
    recipientName: typeof raw.recipientName === 'string' ? raw.recipientName : undefined,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(req);
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid meeting id" }, { status: 400 });
    }

    const { organizerIdQuery } = getUserIdVariants(user.id);
    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const meeting = await db.collection("meetings").findOne(
      { _id: new ObjectId(id), organizerId: organizerIdQuery },
      { projection: { fields: 1 } }
    );

    if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

    return NextResponse.json({ fields: (meeting as any).fields || [] });
  } catch (err) {
    console.error("FIELDS GET ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireUser(req);
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid meeting id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.fields)) {
      return NextResponse.json({ error: "fields must be an array" }, { status: 400 });
    }

    const normalized: Field[] = [];
    for (const f of body.fields) {
      const n = normalizeField(f);
      if (!n) return NextResponse.json({ error: "Invalid field payload" }, { status: 400 });
      normalized.push(n);
    }

    const { organizerIdQuery } = getUserIdVariants(user.id);
    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const result = await db.collection("meetings").updateOne(
      { _id: new ObjectId(id), organizerId: organizerIdQuery },
      { $set: { fields: normalized, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, fields: normalized });
  } catch (err) {
    console.error("FIELDS PUT ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
