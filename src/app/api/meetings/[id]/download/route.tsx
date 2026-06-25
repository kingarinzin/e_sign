import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { PDFDocument } from "pdf-lib";
import { readFile } from "fs/promises";
import path from "path";
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = auth(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const meetingId = id;

    if (!ObjectId.isValid(meetingId)) {
      return NextResponse.json({ error: "Invalid meeting ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("e_sign_db");

    const meeting = await db.collection("meetings").findOne({
      _id: new ObjectId(meetingId),
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const { userIdStr, organizerIdQuery } = getUserIdVariants(user.id);
    const userDoc = await db.collection("users").findOne({ _id: new ObjectId(userIdStr) });
    if (!userDoc) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userEmail = userDoc.email?.toLowerCase();
    const isOrganizer = 
      (typeof meeting.organizerId === 'string' && meeting.organizerId === userIdStr) ||
      (meeting.organizerId instanceof ObjectId && meeting.organizerId.toString() === userIdStr) ||
      (typeof meeting.organizerId === 'object' && meeting.organizerId?.toString() === userIdStr);
    const isParticipant = meeting.participants?.some(
      (p: any) => p.email?.toLowerCase() === userEmail
    );

    if (!isOrganizer && !isParticipant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const pdfPath = path.join(
      process.cwd(),
      "public",
      "uploads",
      String(meeting.storedFileName)
    );

    const originalPdfBytes = await readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(originalPdfBytes);
    const pages = pdfDoc.getPages();

    // ─── Process placed fields (signature, name, date, initial) ───
    for (const field of meeting.fields || []) {
      const pageIndex = field.page - 1;
      if (pageIndex < 0 || pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      const fieldRecipient = field.recipientName?.toLowerCase() || '';
      const fieldOwner = meeting.participants?.find((p: any) => {
        const pName = p.name?.toLowerCase() || '';
        const pEmail = p.email?.toLowerCase() || '';
        return fieldRecipient === pName || fieldRecipient === pEmail ||
               pName.includes(fieldRecipient) || fieldRecipient.includes(pName);
      });

      if (!fieldOwner?.signed) continue;

      const x = field.xPct * pageWidth;
      const y = pageHeight - (field.yPct * pageHeight) - (field.hPct * pageHeight);
      const width = field.wPct * pageWidth;
      const height = field.hPct * pageHeight;

      // ─── Full signature field ────────────────────────────────────
      if (field.type === 'signature' && fieldOwner.signature) {
        try {
          const base64Data = fieldOwner.signature.split(',')[1];
          if (!base64Data) continue;
          const imageBytes = Buffer.from(base64Data, 'base64');
          let image;
          if (fieldOwner.signature.includes('image/png') || fieldOwner.signature.includes('data:image/png')) {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            image = await pdfDoc.embedJpg(imageBytes);
          }
          page.drawImage(image, { x, y, width, height });
        } catch (err) {
          console.error('Error embedding signature:', err);
        }
      }

      // ─── NEW: Initial signature field ────────────────────────────
      else if (field.type === 'initial' && fieldOwner.initialSignature) {
        try {
          const base64Data = fieldOwner.initialSignature.split(',')[1];
          if (!base64Data) continue;
          const imageBytes = Buffer.from(base64Data, 'base64');
          let image;
          if (fieldOwner.initialSignature.includes('image/png') || fieldOwner.initialSignature.includes('data:image/png')) {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            image = await pdfDoc.embedJpg(imageBytes);
          }
          page.drawImage(image, { x, y, width, height });
        } catch (err) {
          console.error('Error embedding initial signature:', err);
        }
      }

      // ─── Name field ──────────────────────────────────────────────
      else if (field.type === 'name') {
        const fontSize = height * 0.6;
        page.drawText(fieldOwner.name || '', {
          x: x + 5,
          y: y + (height - fontSize) / 2,
          size: Math.max(8, Math.min(fontSize, 20)),
        });
      }

      // ─── Date field ──────────────────────────────────────────────
      else if (field.type === 'date') {
        const dateStr = new Date(fieldOwner.signedAt).toLocaleDateString();
        const fontSize = height * 0.5;
        page.drawText(dateStr, {
          x: x + 5,
          y: y + (height - fontSize) / 2,
          size: Math.max(6, Math.min(fontSize, 16)),
        });
      }
    }

    // ─── Process freeform signatures (full and initial) ──────────
    for (const participant of meeting.participants || []) {
      if (!participant.signed) continue;

      // ─── Full signature positions ────────────────────────────────
      if (participant.signaturePositions && participant.signaturePositions.length > 0) {
        for (const pos of participant.signaturePositions) {
          const pageIndex = pos.page - 1;
          if (pageIndex < 0 || pageIndex >= pages.length) continue;
          const page = pages[pageIndex];
          const { width: pageWidth, height: pageHeight } = page.getSize();

          try {
            const base64Data = participant.signature?.split(',')[1];
            if (!base64Data) continue;
            const imageBytes = Buffer.from(base64Data, 'base64');
            let image;
            if (participant.signature.includes('image/png') || participant.signature.includes('data:image/png')) {
              image = await pdfDoc.embedPng(imageBytes);
            } else {
              image = await pdfDoc.embedJpg(imageBytes);
            }

            const isPercentage = pos.x < 2 && pos.y < 2;
            let x, y, width, height;
            if (isPercentage) {
              x = pos.x * pageWidth;
              y = pageHeight - (pos.y * pageHeight) - (pos.height * pageHeight);
              width = pos.width * pageWidth;
              height = pos.height * pageHeight;
            } else {
              const scale = pageWidth / 700;
              x = pos.x * scale;
              y = pageHeight - (pos.y * scale) - (pos.height * scale);
              width = pos.width * scale;
              height = pos.height * scale;
            }
            page.drawImage(image, { x, y, width, height });
          } catch (err) {
            console.error('Error embedding freeform signature:', err);
          }
        }
      }

      // ─── NEW: Initial signature positions ────────────────────────
      if (participant.initialSignaturePositions && participant.initialSignaturePositions.length > 0) {
        for (const pos of participant.initialSignaturePositions) {
          const pageIndex = pos.page - 1;
          if (pageIndex < 0 || pageIndex >= pages.length) continue;
          const page = pages[pageIndex];
          const { width: pageWidth, height: pageHeight } = page.getSize();

          try {
            const base64Data = participant.initialSignature?.split(',')[1];
            if (!base64Data) continue;
            const imageBytes = Buffer.from(base64Data, 'base64');
            let image;
            if (participant.initialSignature.includes('image/png') || participant.initialSignature.includes('data:image/png')) {
              image = await pdfDoc.embedPng(imageBytes);
            } else {
              image = await pdfDoc.embedJpg(imageBytes);
            }

            const isPercentage = pos.x < 2 && pos.y < 2;
            let x, y, width, height;
            if (isPercentage) {
              x = pos.x * pageWidth;
              y = pageHeight - (pos.y * pageHeight) - (pos.height * pageHeight);
              width = pos.width * pageWidth;
              height = pos.height * pageHeight;
            } else {
              const scale = pageWidth / 700;
              x = pos.x * scale;
              y = pageHeight - (pos.y * scale) - (pos.height * scale);
              width = pos.width * scale;
              height = pos.height * scale;
            }
            page.drawImage(image, { x, y, width, height });
          } catch (err) {
            console.error('Error embedding freeform initial signature:', err);
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${meeting.title || 'document'}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("DOWNLOAD ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}