import type { SocketRoomState } from "@/types";

const rooms = new Map<string, SocketRoomState>();
const socketRooms = new Map<string, Array<{ code: string; role: string }>>();

export function getRoomState(code: string) {
  return rooms.get(code) ?? null;
}

export function setRoomState(code: string, state: SocketRoomState) {
  rooms.set(code, state);
}

export function updateRoomState(code: string, updater: (state: SocketRoomState) => SocketRoomState) {
  const current = rooms.get(code);
  if (!current) {
    return null;
  }

  const next = updater(current);
  rooms.set(code, next);
  return next;
}

export function deleteRoomState(code: string) {
  rooms.delete(code);
}

export function addSocketToRoom(code: string, socketId: string) {
  const existing = socketRooms.get(socketId) ?? [];
  existing.push({ code, role: "listener" });
  socketRooms.set(socketId, existing);
}

export function setSocketRoomRole(socketId: string, code: string, role: string) {
  const roomsForSocket = socketRooms.get(socketId) ?? [];
  const index = roomsForSocket.findIndex((entry) => entry.code === code);
  if (index >= 0) {
    roomsForSocket[index] = { code, role };
  } else {
    roomsForSocket.push({ code, role });
  }
  socketRooms.set(socketId, roomsForSocket);
}

export function isHostSocket(socketId: string, code: string) {
  return socketRooms.get(socketId)?.some((entry) => entry.code === code && entry.role === "host") ?? false;
}

export function removeSocketFromRooms(socketId: string) {
  const joinedRooms = socketRooms.get(socketId);
  if (!joinedRooms) {
    return [] as string[];
  }

  socketRooms.delete(socketId);
  return joinedRooms.map((entry) => entry.code);
}
