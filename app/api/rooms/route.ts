import { NextResponse } from "next/server";
import { createRoomCode } from "@/lib/auth/room-code";
import { getSessionUser } from "@/lib/auth/session";
import { getDb } from "@/lib/mongodb/client";

export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  let code = createRoomCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.collection("rooms").findOne({ code });
    if (!existing) {
      break;
    }
    code = createRoomCode();
  }

  const room = {
    code,
    hostUserId: user.userId,
    hostName: user.name,
    createdAt: new Date(),
    active: true,
    playback: { trackId: null, isPlaying: false, currentTime: 0, volume: 1, updatedAt: new Date() },
  };

  await db.collection("rooms").insertOne(room);
  return NextResponse.json({ room });
}
