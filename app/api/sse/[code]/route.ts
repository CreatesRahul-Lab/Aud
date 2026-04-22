import { addClient, removeClient } from "@/lib/sse/clients";
import { removeClientFromRooms, getRoomState, setRoomState, deleteRoomState } from "@/lib/sse/state";
import { broadcast } from "@/lib/sse/clients";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clientId = new URL(request.url).searchParams.get("clientId");

  if (!clientId) {
    return new Response("Missing clientId", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));

      addClient(code, clientId, controller);

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 30_000);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        removeClient(code, clientId);
        handleDisconnect(code, clientId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      removeClient(code, clientId);
      handleDisconnect(code, clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function handleDisconnect(code: string, clientId: string) {
  const codes = removeClientFromRooms(clientId);

  for (const roomCode of codes) {
    const state = getRoomState(roomCode);
    if (!state) continue;

    const updatedParticipants = state.participants.map((p) =>
      p.clientId === clientId ? { ...p, connected: false } : p,
    );
    const anyConnected = updatedParticipants.some((p) => p.connected);

    if (!anyConnected) {
      deleteRoomState(roomCode);
      broadcast(roomCode, "room:closed", { code: roomCode });
      return;
    }

    setRoomState(roomCode, { ...state, participants: updatedParticipants });
    broadcast(roomCode, "room:state", getRoomState(roomCode));
  }
}
