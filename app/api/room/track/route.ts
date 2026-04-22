import { NextResponse } from "next/server";
import { isHostClient, updateRoomState } from "@/lib/sse/state";
import { broadcast } from "@/lib/sse/clients";

export async function POST(request: Request) {
  const { code, clientId, trackId } = await request.json();

  if (!code || !clientId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!isHostClient(clientId, code)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const next = updateRoomState(code, (state) => ({
    ...state,
    playback: {
      ...state.playback,
      trackId,
      isPlaying: false,
      currentTime: 0,
      updatedAt: new Date().toISOString(),
    },
  }));

  if (next) {
    broadcast(code, "room:state", next);
  }

  return NextResponse.json({ ok: true });
}
