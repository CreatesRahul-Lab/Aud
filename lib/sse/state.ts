import type { RoomState } from "@/types";

const g = globalThis as unknown as {
  __sseRooms?: Map<string, RoomState>;
  __sseClientRooms?: Map<string, Array<{ code: string; role: string }>>;
};

const rooms = (g.__sseRooms ??= new Map<string, RoomState>());
const clientRooms = (g.__sseClientRooms ??= new Map<string, Array<{ code: string; role: string }>>());

export function getRoomState(code: string) {
  return rooms.get(code) ?? null;
}

export function setRoomState(code: string, state: RoomState) {
  rooms.set(code, state);
}

export function updateRoomState(code: string, updater: (state: RoomState) => RoomState) {
  const current = rooms.get(code);
  if (!current) return null;

  const next = updater(current);
  rooms.set(code, next);
  return next;
}

export function deleteRoomState(code: string) {
  rooms.delete(code);
}

export function addClientToRoom(code: string, clientId: string) {
  const existing = clientRooms.get(clientId) ?? [];
  existing.push({ code, role: "listener" });
  clientRooms.set(clientId, existing);
}

export function setClientRoomRole(clientId: string, code: string, role: string) {
  const entries = clientRooms.get(clientId) ?? [];
  const index = entries.findIndex((e) => e.code === code);
  if (index >= 0) {
    entries[index] = { code, role };
  } else {
    entries.push({ code, role });
  }
  clientRooms.set(clientId, entries);
}

export function isHostClient(clientId: string, code: string) {
  return clientRooms.get(clientId)?.some((e) => e.code === code && e.role === "host") ?? false;
}

export function removeClientFromRooms(clientId: string) {
  const joined = clientRooms.get(clientId);
  if (!joined) return [] as string[];

  clientRooms.delete(clientId);
  return joined.map((e) => e.code);
}
