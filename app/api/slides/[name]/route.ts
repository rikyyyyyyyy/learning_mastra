import fs from "fs";
import path from "path";

const SLIDES_DIR = path.join(process.cwd(), ".generated-slides");

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name } = await ctx.params;
  // Basic filename validation to prevent path traversal
  if (!/^[A-Za-z0-9._-]+$/.test(name) || !name.toLowerCase().endsWith(".html")) {
    return new Response("Bad Request", { status: 400 });
  }
  const filePath = path.join(SLIDES_DIR, name);
  try {
    const data = await fs.promises.readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    if (err?.code === "ENOENT") return new Response("Not Found", { status: 404 });
    return new Response("Server Error", { status: 500 });
  }
}
