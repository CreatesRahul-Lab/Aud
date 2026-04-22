import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb/client";

export const runtime = "nodejs";

/**
 * GET /api/audio/[id]
 *
 * Looks up the asset in MongoDB and redirects the browser to the
 * Cloudinary URL. This keeps the audio src pattern identical for the
 * room player while serving from Cloudinary's CDN.
 */
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const db = await getDb();
  const asset = await db.collection("audioAssets").findOne({ assetId: id });

  if (!asset) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  // Redirect browser to Cloudinary CDN URL
  return NextResponse.redirect(asset.cloudinaryUrl as string, { status: 302 });
}
