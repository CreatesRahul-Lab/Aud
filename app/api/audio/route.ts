import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/mongodb/client";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const tracks = await db
    .collection("audioAssets")
    .find({ ownerId: user.userId })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({ tracks });
}