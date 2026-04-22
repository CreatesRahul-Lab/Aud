import { NextResponse } from "next/server";
import { verifyHost } from "@/lib/auth/verify-host";
import { updateRoomState } from "@/lib/sse/state";
import { broadcast } from "@/lib/sse/clients";

export async function POST(request: Request) {
  const { code, currentTime } = await request.json();

  if (!code) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const userId = await verifyHost(code);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const next = updateRoomState(code, (state) => ({
    ...state,
    playback: {
      ...state.playback,
      isPlaying: false,
      currentTime,
      updatedAt: new Date().toISOString(),
    },
  }));

  if (next) {
    broadcast(code, "room:pause", next.playback);
  }

  return NextResponse.json({ ok: true });
}
