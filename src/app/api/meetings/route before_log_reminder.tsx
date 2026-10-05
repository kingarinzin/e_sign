import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { getUserIdVariants } from "@/lib/auth-helpers";

export const runtime = "nodejs"; // IMPORTANT: fs/path require Node runtime

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1] || null;
}

function safeFileBaseName(originalName: string) {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9-_]/g, "_");
  return { base, ext };
}

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

function requireUserId(decoded: any) {
  const id = decoded?.id;
  if (!id || typeof id !== "string")
    throw new Error("Invalid token payload: missing id");
  return new ObjectId(id);
}

/**
 * Shared aggregation pipeline builder.
 *
 * CRITICAL: We strip out base64 signature images from participants. Each
 * signature is ~100 KB; a meeting with 11 participants was 6.4 MB. Without
 * this projection the /api/meetings response can be tens of MB per request,
 * causing multi-second page loads.
 *
 * The dashboard needs: name, email, role, signed, isCurrent, isExternal,
 * signedAt, lastRemindedAt, order. Plus organizerId at the meeting level
 * (for reminder-permission checks).
 */
const buildMeetingsPipeline = (matchStage: Record<string, any>) => [
  { $match: matchStage },
  { $sort: { createdAt: -1 } },
  {
    $project: {
      _id: 1,
      title: 1,
      date: 1,
      status: 1,
      description: 1,
      sentAt: 1,
      createdAt: 1,
      currentSignerIndex: 1,
      organizerId: 1,                    // ← ADDED — for organizer check
      participants: {
        $map: {
          input: { $ifNull: ["$participants", []] },
          as: "p",
          in: {
            name: "$$p.name",
            email: "$$p.email",
            role: "$$p.role",
            signed: "$$p.signed",
            isCurrent: "$$p.isCurrent",
            isExternal: "$$p.isExternal",
            signedAt: "$$p.signedAt",              // ← ADDED — signing timestamp
            lastRemindedAt: "$$p.lastRemindedAt",  // ← ADDED — cooldown info
            order: "$$p.order",                    // ← ADDED — sequential order
          },
        },
      },
    },
  },
];

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let decoded: any;
    try {
      decoded = jwt.verify(token, requireJwtSecret());
    } catch (jwtErr) {
      console.error("JWT Verification Error:", jwtErr);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { organizerIdQuery } = getUserIdVariants(decoded.id);

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // Get user's email for participant matching
    const usersDb = db.collection("users");
    const user = await usersDb.findOne({ _id: new ObjectId(decoded.id) });
    const userEmail = user?.email;

    // Run both queries in parallel. Each one uses $project to send only
    // the fields the dashboard needs.
    const [organizedMeetings, participantMeetings] = await Promise.all([
      db
        .collection("meetings")
        .aggregate(buildMeetingsPipeline({ organizerId: organizerIdQuery }))
        .toArray(),

      userEmail
        ? db
            .collection("meetings")
            .aggregate(
              buildMeetingsPipeline({
                "participants.email": userEmail,
                organizerId: {
                  $nin: [new ObjectId(decoded.id), decoded.id],
                },
              })
            )
            .toArray()
        : Promise.resolve([] as any[]),
    ]);

    const allMeetings = [...organizedMeetings, ...participantMeetings];

    return NextResponse.json({
      meetings: allMeetings,
      userEmail,
    });
  } catch (err) {
    console.error("MEETINGS GET ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let decoded: any;
    try {
      decoded = jwt.verify(token, requireJwtSecret());
    } catch (jwtErr) {
      console.error("JWT Verification Error:", jwtErr);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { userIdObj, userIdStr } = getUserIdVariants(decoded.id);
    const userId = userIdObj ?? new ObjectId(userIdStr);

    const formData = await req.formData();
    const dataRaw = formData.get("data");
    const file = formData.get("file") as File | null;

    if (!dataRaw)
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    if (!file)
      return NextResponse.json({ error: "Missing file" }, { status: 400 });

    if (!allowedMimeTypes.has(file.type)) {
      return NextResponse.json(
        { error: "Only PDF or Word documents allowed" },
        { status: 400 }
      );
    }

    let data: any;
    try {
      data = JSON.parse(String(dataRaw));
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in data" },
        { status: 400 }
      );
    }

    const { title, description, participants, action, date, signingMode } =
      data;

    if (!title?.trim() || !description?.trim() || !Array.isArray(participants)) {
      return NextResponse.json(
        { error: "Invalid form data" },
        { status: 400 }
      );
    }

    // ─── Build cleaned participants (preserves isExternal flag) ──
    const cleanedParticipants = participants.map((p: any) => ({
      name: String(p?.name || "").trim(),
      email: String(p?.email || "").trim(),
      role: String(p?.role || "Signer").trim(),
      signed: false,
      isExternal: Boolean(p?.isExternal),
    }));

    if (cleanedParticipants.some((p: any) => !p.name || !p.email)) {
      return NextResponse.json(
        { error: "Each participant must have name and email" },
        { status: 400 }
      );
    }

    const emails = cleanedParticipants.map((p: any) =>
      p.email.toLowerCase()
    );
    const unique = new Set(emails);
    if (unique.size !== emails.length) {
      return NextResponse.json(
        { error: "Duplicate participant emails" },
        { status: 400 }
      );
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!fssync.existsSync(uploadDir)) {
      fssync.mkdirSync(uploadDir, { recursive: true });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { base, ext } = safeFileBaseName(file.name);
    const rand = crypto.randomBytes(6).toString("hex");
    const storedFileName = `${Date.now()}-${base}-${rand}${ext}`;
    const absolutePath = path.join(uploadDir, storedFileName);

    await fs.writeFile(absolutePath, buffer);

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const status = action === "prepare" ? "Prepared" : "Draft";

    const result = await db.collection("meetings").insertOne({
      title: title.trim(),
      date: date ? new Date(date) : null,
      description: description.trim(),
      participants: cleanedParticipants,
      originalFileName: file.name,
      storedFileName,
      filePath: `/api/file?id=${encodeURIComponent(storedFileName)}`,
      status,
      organizerId: userId,
      fields: [],
      signingMode: signingMode || "sequential",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      message:
        status === "Prepared"
          ? "Meeting prepared"
          : "Meeting saved as draft",
      meetingId: result.insertedId.toString(),
    });
  } catch (err) {
    console.error("MEETING API ERROR:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}