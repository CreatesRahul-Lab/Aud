import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { uploadAudioAsset } from "@/lib/audio/gridfs";
import { getDb } from "@/lib/mongodb/client";

export const runtime = "nodejs";

// Disable Next.js body size limit — audio files can be large (50 MB+)
export const maxDuration = 60; // seconds (Vercel hobby allows up to 60)


export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const title = String(formData.get("title") ?? "Untitled track");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }

  const db = await getDb();
  const bytes = Buffer.from(await file.arrayBuffer());
  const assetId = await uploadAudioAsset({
    ownerId: user.userId,
    fileName: file.name,
    contentType: file.type || "audio/mpeg",
    bytes,
  });

  await db.collection("audioAssets").insertOne({
    assetId,
    ownerId: user.userId,
    title,
    fileName: file.name,
    contentType: file.type || "audio/mpeg",
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, assetId });
}
