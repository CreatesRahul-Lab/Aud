"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { SocketRoomState } from "@/types";

export function RoomClient({ code, initialState, userId, userName, role, tracks }: { code: string; initialState: SocketRoomState | null; userId: string; userName: string; role: "host" | "listener"; tracks: Array<{ assetId: string; title: string }>; }) {
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<SocketRoomState | null>(initialState);
  const [volume, setVolume] = useState(initialState?.playback.volume ?? 1);

  useEffect(() => {
    const socket = io(undefined, { path: "/socket.io" });
    socketRef.current = socket;

    socket.emit("room:join", { code, userId, name: userName, role });

    socket.on("room:state", (nextState: SocketRoomState) => {
      setState(nextState);
      setVolume(nextState.playback.volume);
    });

    socket.on("room:play", (playback) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
      void audio.play();
    });

    socket.on("room:pause", (playback) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
      audio.pause();
    });

    socket.on("room:seek", (playback) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
    });

    return () => {
      socket.disconnect();
    };
  }, [code, role, userId, userName]);

  function emitPlay() {
    const audio = audioRef.current;
    if (!audio || !socketRef.current) return;
    socketRef.current.emit("room:play", { code, currentTime: audio.currentTime, trackId: state?.playback.trackId ?? null });
  }

  function emitPause() {
    const audio = audioRef.current;
    if (!audio || !socketRef.current) return;
    socketRef.current.emit("room:pause", { code, currentTime: audio.currentTime });
  }

  function emitSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(event.target.value);
    if (!audio || !socketRef.current) return;
    audio.currentTime = value;
    socketRef.current.emit("room:seek", { code, currentTime: value });
  }

  function emitVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const nextVolume = Number(event.target.value);
    if (!audio) return;
    audio.volume = nextVolume;
    setVolume(nextVolume);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glow backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Room {code}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{role === "host" ? "Host dashboard" : "Listener view"}</h1>
        <p className="mt-2 text-sm text-slate-300">Connected as {userName}. Playback remains local and synchronized through Socket.IO.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          {role === "host" ? (
            <label className="mb-4 block space-y-2 text-sm text-slate-300">
              <span>Active track</span>
              <select
                value={state?.playback.trackId ?? ""}
                onChange={(event) => socketRef.current?.emit("room:track", { code, trackId: event.target.value || null })}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
              >
                <option value="">Select a track</option>
                {tracks.map((track) => (
                  <option key={track.assetId} value={track.assetId}>
                    {track.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <audio ref={audioRef} controls className="w-full" src={state?.playback.trackId ? `/api/audio/${state.playback.trackId}` : undefined} />
          {role === "host" ? (
            <>
              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={emitPlay} className="rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950">Play</button>
                <button onClick={emitPause} className="rounded-2xl bg-white px-4 py-3 font-medium text-slate-950">Pause</button>
              </div>
              <label className="mt-6 block space-y-2 text-sm text-slate-300">
                <span>Seek</span>
                <input type="range" min="0" max="3600" defaultValue={0} onChange={emitSeek} className="w-full" />
              </label>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-400">Playback controls are host-only. Your device follows the room state in real time.</p>
          )}
          <label className="mt-4 block space-y-2 text-sm text-slate-300">
            <span>Volume: {Math.round(volume * 100)}%</span>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={emitVolume} className="w-full" />
          </label>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6">
          <h2 className="text-xl font-medium text-white">Participants</h2>
          <div className="mt-4 space-y-3">
            {state?.participants.map((participant) => (
              <div key={participant.socketId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                {participant.name} - {participant.role} {participant.connected ? "online" : "offline"}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
