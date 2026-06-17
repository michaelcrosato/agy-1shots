import fs from "fs";
import path from "path";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse("Method Not Allowed", { status: 405 });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body || typeof body.id !== "string") {
    return new NextResponse(JSON.stringify({ error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = body;

  // Rejects path traversal
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const oneShotsDir = path.resolve(process.cwd(), "../one-shots");
  const targetDir = path.join(oneShotsDir, id);

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return new NextResponse(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    console.error("Archiver error:", err);
  });

  archive.directory(targetDir, false, (entry) => {
    // Exclude node_modules and .git
    if (
      entry.name === "node_modules" ||
      entry.name.startsWith("node_modules/") ||
      entry.name.startsWith("node_modules\\") ||
      entry.name === ".git" ||
      entry.name.startsWith(".git/") ||
      entry.name.startsWith(".git\\")
    ) {
      return false;
    }

    // Ensure the file filter ignores symbolic links or junctions to prevent exfiltration of outside files
    try {
      const entryPath = path.join(targetDir, entry.name);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        return false;
      }
    } catch (err) {
      return false;
    }

    return entry;
  });

  // Finalize the archive. Because we use Readable.toWeb(archive), Next.js reads the stream as data is written.
  archive.finalize();

  const webStream = Readable.toWeb(archive);

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${id}.zip"`,
    },
  });
}
