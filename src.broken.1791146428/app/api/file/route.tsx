import path from "path";
import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";

export const runtime = "nodejs";

function safe(name: string) {
  return !!name && !name.includes("..") && !name.includes("/") && !name.includes("\\");
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

async function fileInfo(id: string) {
  const absolute = path.join(process.cwd(), "public", "uploads", id);
  const s = await stat(absolute);
  return { absolute, size: s.size };
}

export async function HEAD(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id || !safe(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const { size } = await fileInfo(id);

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="document.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id || !safe(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let absolute = "";
  let size = 0;

  try {
    const info = await fileInfo(id);
    absolute = info.absolute;
    size = info.size;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
        "Content-Disposition": `inline; filename="document.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const nodeStream = createReadStream(absolute);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="document.pdf"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
