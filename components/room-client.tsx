"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RoomState } from "@/types";

export function RoomClient({
  code,
  initialState,
  userId,
  userName,
  role,
  tracks,
}: {
  code: string;
  initialState: RoomState | null;
  userId: string;
  userName: string;
  role: "host" | "listener";
  tracks: Array<{ assetId: string; title: string }>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const clientIdRef = useRef(crypto.randomUUID());
  const joinedRef = useRef<Promise<void> | null>(null);

  const [state, setState] = useState<RoomState | null>(initialState);
  // Host's own local volume (not sent to server)
  const [hostVolume, setHostVolume] = useState(1);
  // Per-listener volumes keyed by clientId — only used on host's UI
  const [listenerVolumes, setListenerVolumes] = useState<Record<string, number>>({});
  // Listener's own current volume (set by host via room:volume)
  const [myVolume, setMyVolume] = useState(initialState?.playback.volume ?? 1);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Debounce timers per-listener clientId
  const listenerDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const post = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    if (joinedRef.current) await joinedRef.current;
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    const clientId = clientIdRef.current;
    const source = new EventSource(`/api/sse/${code}?clientId=${clientId}`);

    source.addEventListener("open", () => {
      joinedRef.current = fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, userId, name: userName, role, clientId }),
      }).then(() => {});
    });

    source.addEventListener("room:state", (e) => {
      const nextState: RoomState = JSON.parse(e.data);
      setState(nextState);
      // Seed any new listener into the volumes map at 100%
      if (role === "host") {
        setListenerVolumes((prev) => {
          const next = { ...prev };
          for (const p of nextState.participants) {
            if (p.role === "listener" && !(p.clientId in next)) {
              next[p.clientId] = 1;
            }
          }
          return next;
        });
      }
    });

    source.addEventListener("room:play", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
      playPromiseRef.current = audio.play();
    });

    source.addEventListener("room:pause", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      const settle = playPromiseRef.current ?? Promise.resolve();
      settle
        .then(() => {
          audio.currentTime = playback.currentTime;
          audio.pause();
        })
        .catch(() => {});
    });

    source.addEventListener("room:seek", (e) => {
      const playback = JSON.parse(e.data);
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = playback.currentTime;
    });

    // Targeted volume — host set this client's volume specifically
    source.addEventListener("room:volume", (e) => {
      const { volume: v } = JSON.parse(e.data);
      setMyVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
    });

    return () => source.close();
  }, [code, role, userId, userName]);

  // ── Audio time tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
    };
  });

  // ── Host actions ────────────────────────────────────────────────────────────
  function emitPlay() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/play", {
      code,
      currentTime: audio.currentTime,
      trackId: state?.playback.trackId ?? null,
    });
  }

  function emitPause() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/pause", { code, currentTime: audio.currentTime });
  }

  function emitSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(event.target.value);
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
    post("/api/room/seek", { code, currentTime: value });
  }

  function emitTrack(trackId: string | null) {
    post("/api/room/track", { code, trackId });
  }

  // Host's own local volume — no server call, just affects their own audio
  function handleHostVolume(event: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(event.target.value);
    setHostVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  // Per-listener volume — debounced, POSTs to only that listener's device
  function handleListenerVolume(targetClientId: string, v: number) {
    setListenerVolumes((prev) => ({ ...prev, [targetClientId]: v }));

    const timers = listenerDebounceRef.current;
    if (timers[targetClientId]) clearTimeout(timers[targetClientId]);
    timers[targetClientId] = setTimeout(() => {
      post("/api/room/volume", { code, volume: v, targetClientId });
    }, 150);
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const activeTrackTitle =
    tracks.find((t) => t.assetId === state?.playback.trackId)?.title ?? null;

  const listeners = state?.participants.filter((p) => p.role === "listener") ?? [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Room {code}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          {role === "host" ? "Host dashboard" : "Listener view"}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Connected as {userName}. Playback is synchronized in real time via SSE.
        </p>
      </section>

      {role === "host" ? (
        // ── HOST LAYOUT ────────────────────────────────────────────────────────
        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Playback controls */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-5">
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Active track</span>
              <select
                value={state?.playback.trackId ?? ""}
                onChange={(e) => emitTrack(e.target.value || null)}
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

            {/* Hidden audio */}
            <audio
              ref={audioRef}
              src={state?.playback.trackId ? `/api/audio/${state.playback.trackId}` : undefined}
            />

            <div className="flex flex-wrap gap-3">
              <button
                onClick={emitPlay}
                className="rounded-2xl bg-sky-400 px-5 py-3 font-medium text-slate-950 hover:bg-sky-300 transition-colors"
              >
                ▶ Play
              </button>
              <button
                onClick={emitPause}
                className="rounded-2xl bg-white px-5 py-3 font-medium text-slate-950 hover:bg-slate-100 transition-colors"
              >
                ⏸ Pause
              </button>
            </div>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>Seek — {formatTime(currentTime)} / {formatTime(duration)}</span>
              <input
                type="range"
                min="0"
                max={duration || 1}
                step="0.1"
                value={currentTime}
                onChange={emitSeek}
                className="w-full accent-sky-400"
              />
            </label>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>My volume — {Math.round(hostVolume * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={hostVolume}
                onChange={handleHostVolume}
                className="w-full accent-sky-400"
              />
            </label>
          </div>

          {/* Participants + per-listener volume */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-4">
            <h2 className="text-xl font-medium text-white">Participants</h2>

            {/* Host row (no volume control for yourself here) */}
            {state?.participants
              .filter((p) => p.role === "host")
              .map((p) => (
                <div
                  key={p.clientId}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{p.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-sky-400 uppercase tracking-wide">host</span>
                      <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-rose-400"}`} />
                    </span>
                  </div>
                </div>
              ))}

            {/* Listener rows with per-listener volume */}
            {listeners.length === 0 ? (
              <p className="text-sm text-slate-500">No listeners yet.</p>
            ) : (
              listeners.map((p) => {
                const vol = listenerVolumes[p.clientId] ?? 1;
                return (
                  <div
                    key={p.clientId}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-violet-400 uppercase tracking-wide">listener</span>
                        <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-rose-400"}`} />
                      </span>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs text-slate-400">
                        Volume: {Math.round(vol * 100)}%
                        {!p.connected && (
                          <span className="ml-2 text-rose-400">(offline)</span>
                        )}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={vol}
                        disabled={!p.connected}
                        onChange={(e) =>
                          handleListenerVolume(p.clientId, Number(e.target.value))
                        }
                        className="w-full accent-violet-400 disabled:opacity-40"
                      />
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : (
        // ── LISTENER LAYOUT ────────────────────────────────────────────────────
        <section className="space-y-6">
          {/* Hidden audio element — all control comes from host via SSE */}
          <audio
            ref={audioRef}
            src={state?.playback.trackId ? `/api/audio/${state.playback.trackId}` : undefined}
          />

          {/* Now Playing card */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Now Playing</p>
            {activeTrackTitle ? (
              <>
                <p className="text-xl font-semibold text-white truncate">{activeTrackTitle}</p>
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                      state?.playback.isPlaying
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-slate-700/50 text-slate-400"
                    }`}
                  >
                    {state?.playback.isPlaying ? "▶" : "⏸"}
                  </span>
                  <span className="text-sm text-slate-400">
                    {state?.playback.isPlaying ? "Playing" : "Paused"} · controlled by host
                  </span>
                </div>
              </>
            ) : (
              <p className="text-slate-500">Waiting for host to select a track…</p>
            )}
            <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
              <span className="text-lg">🔊</span>
              <div className="flex-1">
                <div
                  className="h-2 rounded-full bg-violet-500/30"
                  style={{ position: "relative" }}
                >
                  <div
                    className="h-2 rounded-full bg-violet-400 transition-all"
                    style={{ width: `${Math.round(myVolume * 100)}%` }}
                  />
                </div>
              </div>
              <span className="text-xs text-slate-400 w-10 text-right">
                {Math.round(myVolume * 100)}%
              </span>
            </div>
            <p className="text-xs text-slate-600">Volume is set by the host for your device.</p>
          </div>

          {/* Participants */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-3">
            <h2 className="text-xl font-medium text-white">Participants</h2>
            {state?.participants.map((p) => (
              <div
                key={p.clientId}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-xs uppercase tracking-wide ${
                        p.role === "host" ? "text-sky-400" : "text-violet-400"
                      }`}
                    >
                      {p.role}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-rose-400"}`}
                    />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
