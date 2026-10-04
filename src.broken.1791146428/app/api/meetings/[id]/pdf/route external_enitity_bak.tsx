// app/api/meetings/[id]/pdf/route.ts

import path from "path";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { getUserIdVariants } from "@/lib/auth-helpers";

export const runtime = "nodejs";

function auth(req: Request): { id: string } | null {
  try {
    const h = req.headers.get("authorization");
    if (!h?.startsWith("Bearer ")) return null;
    const token = h.split(" ")[1];
    return jwt.verify(token, process.env.JWT_SECRET!) as any;
  } catch {
    return null;
  }
}

function safeRange(range: string, size: number) {
  try {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (!m) return null;

    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : size - 1;

    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start > end || start < 0 || start >= size) return null;

    return { start, end: Math.min(end, size - 1) };
  } catch {
    return null;
  }
}

async function getMeetingPdfInfo(meetingId: string, userId: string) {
  try {
    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Find meeting and check if user is organizer or participant
    const meeting = await db.collection("meetings").findOne(
      { _id: new ObjectId(meetingId) },
      { projection: { storedFileName: 1, organizerId: 1, participants: 1 } }
    );

    if (!meeting) return null;

    // Check if user is authorized (organizer or participant)
    // Handle both string and ObjectId formats for organizerId
    const { userIdStr } = getUserIdVariants(userId);
    const isOrganizer = 
      (typeof meeting.organizerId === 'string' && meeting.organizerId === userIdStr) ||
      (meeting.organizerId instanceof ObjectId && meeting.organizerId.toString() === userIdStr) ||
      (typeof meeting.organizerId === 'object' && meeting.organizerId?.toString() === userIdStr);

    // Get user to check email for participant access
    const user = await db.collection("users").findOne({ _id: new ObjectId(userIdStr) });
    if (!user) return null;

    const userEmail = user.email?.toLowerCase();
    const hasAccess = isOrganizer || meeting.participants?.some(
      (p: any) => p.email?.toLowerCase() === userEmail
    );

    if (!hasAccess) return null;

    if (!meeting.storedFileName) return null;

    const absolute = path.join(
      process.cwd(),
      "public",
      "uploads",
      String(meeting.storedFileName)
    );

    try {
      const s = await stat(absolute);
      return { absolute, size: s.size };
    } catch (statError: any) {
      if (statError.code === 'ENOENT') {
        console.error(`PDF file not found: ${absolute}`);
        return { error: 'FILE_MISSING' };
      }
      throw statError;
    }
  } catch (error) {
    console.error("getMeetingPdfInfo error:", error);
    return null;
  }
}

export async function HEAD(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = auth(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const info = await getMeetingPdfInfo(id, user.id);
    if (!info) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ((info as any).error === 'FILE_MISSING') {
      return NextResponse.json({ error: "PDF file is missing from server" }, { status: 404 });
    }
    if (!info.size) {
      return NextResponse.json({ error: "Invalid file" }, { status: 500 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(info.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("HEAD error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = auth(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const info = await getMeetingPdfInfo(id, user.id);
    if (!info) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ((info as any).error === 'FILE_MISSING') {
      return NextResponse.json({ error: "PDF file is missing from server" }, { status: 404 });
    }
    if (!info.size) {
      return NextResponse.json({ error: "Invalid file" }, { status: 500 });
    }

    const range = req.headers.get("range");

    if (range) {
      const se = safeRange(range, info.size);
      if (!se) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      }

      const { start, end } = se;
      const chunkSize = end - start + 1;

      const nodeStream = createReadStream(info.absolute, { start, end });
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    // Full file
    const nodeStream = createReadStream(info.absolute);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(info.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = auth(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const info = await getMeetingPdfInfo(id, user.id);
    if (!info) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ((info as any).error === 'FILE_MISSING') {
      return NextResponse.json({ error: "PDF file is missing from server" }, { status: 404 });
    }
    if (!info.size) {
      return NextResponse.json({ error: "Invalid file" }, { status: 500 });
    }

    const nodeStream = createReadStream(info.absolute);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(info.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
