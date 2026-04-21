import type { Server as HttpServer } from "http";
import type { Server as SocketIOServer } from "socket.io";
import { addSocketToRoom, getRoomState, setRoomState, setSocketRoomRole, updateRoomState, removeSocketFromRooms, deleteRoomState, isHostSocket } from "./state";

export function createSocketServer(_server: HttpServer, io: SocketIOServer) {
  io.on("connection", (socket) => {
    socket.on("room:join", ({ code, userId, name, role }) => {
      socket.join(code);
      addSocketToRoom(code, socket.id);
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

      const participants = nextState.participants.filter((participant) => participant.userId !== userId);
      participants.push({ userId, socketId: socket.id, name, role, connected: true });
      const finalState = { ...nextState, participants };
      setSocketRoomRole(socket.id, code, role);
      setRoomState(code, finalState);
      socket.to(code).emit("room:state", finalState);
      socket.emit("room:state", finalState);
    });

    socket.on("room:play", ({ code, currentTime, trackId }) => {
      if (!isHostSocket(socket.id, code)) {
        return;
      }
      const next = updateRoomState(code, (state) => ({
        ...state,
        playback: {
          ...state.playback,
          trackId: trackId ?? state.playback.trackId,
          isPlaying: true,
          currentTime,
          updatedAt: new Date().toISOString(),
        },
      }));
      if (next) {
        io.to(code).emit("room:play", next.playback);
      }
    });

    socket.on("room:pause", ({ code, currentTime }) => {
      if (!isHostSocket(socket.id, code)) {
        return;
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
        io.to(code).emit("room:pause", next.playback);
      }
    });

    socket.on("room:seek", ({ code, currentTime }) => {
      if (!isHostSocket(socket.id, code)) {
        return;
      }
      const next = updateRoomState(code, (state) => ({
        ...state,
        playback: {
          ...state.playback,
          currentTime,
          updatedAt: new Date().toISOString(),
        },
      }));
      if (next) {
        io.to(code).emit("room:seek", next.playback);
      }
    });

    socket.on("room:track", ({ code, trackId }) => {
      if (!isHostSocket(socket.id, code)) {
        return;
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
        io.to(code).emit("room:state", next);
      }
    });

    socket.on("room:volume", ({ code, volume }) => {
      const next = updateRoomState(code, (state) => ({
        ...state,
        playback: {
          ...state.playback,
          volume,
          updatedAt: new Date().toISOString(),
        },
      }));
      if (next) {
        io.to(code).emit("room:volume", next.playback);
      }
    });

    socket.on("disconnect", () => {
      for (const code of removeSocketFromRooms(socket.id)) {
        const state = getRoomState(code);
        if (!state) {
          continue;
        }

        const updatedParticipants = state.participants.map((participant) =>
          participant.socketId === socket.id ? { ...participant, connected: false } : participant,
        );
        const remaining = updatedParticipants.some((participant) => participant.connected);
        if (!remaining) {
          deleteRoomState(code);
          io.to(code).emit("room:closed", { code });
          continue;
        }

        setRoomState(code, {
          ...state,
          participants: updatedParticipants,
        });
        io.to(code).emit("room:state", getRoomState(code));
      }
    });
  });
}
