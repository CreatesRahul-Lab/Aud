import { NextResponse } from "next/server";
import { isHostClient, updateRoomState } from "@/lib/sse/state";
import { broadcast } from "@/lib/sse/clients";

export async function POST(request: Request) {
  const { code, clientId, volume } = await request.json();

  if (!code || !clientId || volume === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!isHostClient(clientId, code)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const clamped = Math.min(1, Math.max(0, Number(volume)));

  const next = updateRoomState(code, (state) => ({
    ...state,
    playback: {
      ...state.playback,
      volume: clamped,
      updatedAt: new Date().toISOString(),
    },
  }));

  if (next) {
    broadcast(code, "room:volume", { volume: clamped });
  }

  return NextResponse.json({ ok: true });
}
