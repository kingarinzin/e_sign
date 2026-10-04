import path from "path";
import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";

export const runtime = "nodejs";

function isSafeFileName(name: string) {
  return !!name && !name.includes("..") && !name.includes("/") && !name.includes("\\");
}

async function getFileInfo(file: string) {
  const absolute = path.join(process.cwd(), "public", "uploads", file);
  const s = await stat(absolute);
  return { absolute, size: s.size };
}

function rangeToStartEnd(range: string, size: number) {
  const m = range.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;

  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start < 0 || start >= size) return null;

  return { start, end: Math.min(end, size - 1) };
}

export async function HEAD(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params;
    if (!isSafeFileName(file)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    const { size } = await getFileInfo(file);

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params;
    if (!isSafeFileName(file)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    const { absolute, size } = await getFileInfo(file);

    const range = req.headers.get("range");
    if (range) {
      const se = rangeToStartEnd(range, size);
      if (!se) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }

      const { start, end } = se;
      const chunkSize = end - start + 1;

      const nodeStream = createReadStream(absolute, { start, end });
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    // Full file
    const nodeStream = createReadStream(absolute);
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
