import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/mongodb/client";

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { code } = await context.params;
  const db = await getDb();
  const room = await db.collection("rooms").findOne({ code });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({ room });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await context.params;
  const db = await getDb();
  const room = await db.collection("rooms").findOne({ code });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await db.collection("roomParticipants").updateOne(
    { roomCode: code, userId: user.userId },
    { $set: { roomCode: code, userId: user.userId, name: user.name, updatedAt: new Date() }, $setOnInsert: { joinedAt: new Date() } },
    { upsert: true },
  );

  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, roomCode: code, role: body.role ?? "listener" });
}
