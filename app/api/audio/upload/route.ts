import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/mongodb/client";
import { nanoid } from "nanoid";

export const runtime = "nodejs";

/**
 * POST /api/audio/upload
 *
 * Receives only metadata after the client has already uploaded the file
 * directly to Cloudinary. No file bytes pass through this server, so
 * Vercel's 4.5 MB body limit is never hit.
 *
 * Body (JSON):
 *   { title, cloudinaryUrl, cloudinaryPublicId, fileName, contentType }
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, cloudinaryUrl, cloudinaryPublicId, fileName, contentType } = body;

  if (typeof cloudinaryUrl !== "string" || !cloudinaryUrl) {
    return NextResponse.json({ error: "cloudinaryUrl is required" }, { status: 400 });
  }

  const assetId = nanoid();
  const db = await getDb();

  await db.collection("audioAssets").insertOne({
    assetId,
    ownerId: user.userId,
    title: typeof title === "string" && title ? title : "Untitled track",
    fileName: typeof fileName === "string" ? fileName : "",
    contentType: typeof contentType === "string" ? contentType : "audio/mpeg",
    cloudinaryUrl,
    cloudinaryPublicId: typeof cloudinaryPublicId === "string" ? cloudinaryPublicId : null,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, assetId });
}
