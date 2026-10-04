import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";
import formidable from "formidable-serverless";
import fs from "fs";
import path from "path";
import { getUserIdVariants } from "@/lib/auth-helpers";

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

async function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = authHeader.split(" ")[1];
  return jwt.verify(token, process.env.JWT_SECRET!) as any;
}

// GET /api/meetings/:id
// export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
//   try {
//     const { id } = await params; // Fix: Must await params in Next.js 15
//     const decoded = await authenticate(req);

//     const client = await clientPromise;
//     const db = client.db("e_sign_db");

//     const meeting = await db.collection("meetings").findOne({
//       _id: new ObjectId(id),
//       organizerId: decoded.id,
//     });

//     if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });

//     return NextResponse.json({ meeting });
//   } catch (err: any) {
//     return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
//   }
// }

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const meeting = await db.collection("meetings").findOne({ _id: new ObjectId(id) });

    if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Return the meeting object
    return NextResponse.json(meeting);
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}


export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const decoded = await authenticate(req);
    const { organizerIdQuery } = getUserIdVariants(decoded.id);

    // 1. Use native req.formData() instead of formidable
    const formData = await req.formData();
    const dataField = formData.get("data") as string;
    const file = formData.get("file") as File | null;

    if (!dataField) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const { title, description, participants, action, signingMode } = JSON.parse(dataField);

    let fileUpdate: any = {};

    // 2. Handle File Upload if a new file exists
    if (file && file.size > 0) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = Date.now() + "_" + file.name.replaceAll(" ", "_");
      const uploadDir = path.join(process.cwd(), "public/uploads");
      
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      
      fs.writeFileSync(path.join(uploadDir, filename), buffer);

      fileUpdate = {
        fileName: file.name,
        filePath: `/api/file?id=${encodeURIComponent(filename)}`,
      };
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // 3. Perform the update
    const result = await db.collection("meetings").updateOne(
      { _id: new ObjectId(id), organizerId: organizerIdQuery },
      {
        $set: {
          title,
          description,
          participants: participants.map((p: any) => ({ ...p, signed: false })),
          status: action === "prepare" ? "Prepared" : "Draft",
          signingMode: signingMode || "sequential",
          updatedAt: new Date(),
          ...fileUpdate, // Only overwrites fileName/Path if a new file was sent
        },
      }
    );

    return NextResponse.json({ message: "Updated", id });
  } catch (err: any) {
    console.error("PUT ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/meetings/:id
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; // Fix: Must await params
    const decoded = await authenticate(req);
    const { organizerIdQuery } = getUserIdVariants(decoded.id);
    const client = await clientPromise;
    const db = client.db("e_sign_db");

    // First, check if the document is completed
    const meeting = await db.collection("meetings").findOne({ 
      _id: new ObjectId(id), 
      organizerId: organizerIdQuery 
    });

    if (!meeting) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Prevent deletion of completed documents
    if (meeting.status === "Completed") {
      return NextResponse.json({ 
        error: "Cannot delete completed documents. Completed documents are archived for records." 
      }, { status: 403 });
    }

    await db.collection("meetings").deleteOne({ _id: new ObjectId(id), organizerId: organizerIdQuery });
    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}