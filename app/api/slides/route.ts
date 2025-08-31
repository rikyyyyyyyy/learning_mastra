import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SLIDES_DIR = path.join(process.cwd(), ".generated-slides");

export async function GET() {
  try {
    const entries = await fs.promises.readdir(SLIDES_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".html"))
        .map(async (e) => {
          const full = path.join(SLIDES_DIR, e.name);
          const stat = await fs.promises.stat(full);
          return { name: e.name, size: stat.size, mtime: stat.mtimeMs };
        })
    );
    files.sort((a, b) => b.mtime - a.mtime);
    return NextResponse.json({ files });
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code === "ENOENT") {
      return NextResponse.json({ files: [] });
    }
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}

