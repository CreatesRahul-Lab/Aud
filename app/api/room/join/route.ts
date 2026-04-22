import { NextResponse } from "next/server";
import { addClientToRoom, getRoomState, setRoomState, setClientRoomRole } from "@/lib/sse/state";
import { broadcast } from "@/lib/sse/clients";

export async function POST(request: Request) {
  const { code, clientId, userId, name, role } = await request.json();

  if (!code || !clientId || !userId || !name || !role) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  addClientToRoom(code, clientId);

  const existing = getRoomState(code);
  const nextState = existing ?? {
    code,
    hostUserId: role === "host" ? userId : "",
    participants: [],
    playback: {
      trackId: null,
      isPlaying: false,
      currentTime: 0,
      volume: 1,
      updatedAt: new Date().toISOString(),
    },
  };

  const participants = nextState.participants.filter((p) => p.userId !== userId);
  participants.push({ userId, clientId, name, role, connected: true });

  const finalState = { ...nextState, participants };
  setClientRoomRole(clientId, code, role);
  setRoomState(code, finalState);

  broadcast(code, "room:state", finalState);

  return NextResponse.json({ ok: true });
}
