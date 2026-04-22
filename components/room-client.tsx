"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { RoomState } from "@/types";

type DesiredPlayback = {
  isPlaying: boolean;
  currentTime: number;
  updatedAt: string;
};

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
  const desiredRef = useRef<DesiredPlayback | null>(null);

  const [state, setState] = useState<RoomState | null>(initialState);
  const [hostVolume, setHostVolume] = useState(1);
  const [listenerVolumes, setListenerVolumes] = useState<Record<string, number>>({});
  const [myVolume, setMyVolume] = useState(initialState?.playback.volume ?? 1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Listener: has the user tapped "Enable audio"? Mobile browsers require a
  // direct user gesture before audio.play() is permitted.
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Volume guard refs
  const listenerDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const hostMandatedVolumeRef = useRef(initialState?.playback.volume ?? 1);
  const settingVolumeRef = useRef(false);

  // Vibration nudge
  const [showVolumeNudge, setShowVolumeNudge] = useState(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const post = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    if (joinedRef.current) await joinedRef.current;
    return fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function setListenerVolume(v: number) {
    hostMandatedVolumeRef.current = v;
    const audio = audioRef.current;
    if (!audio) return;
    settingVolumeRef.current = true;
    audio.volume = v;
    settingVolumeRef.current = false;
  }

  function safePlay(audio: HTMLAudioElement) {
    const p = audio.play();
    playPromiseRef.current = p;
    p.catch(() => {});
    return p;
  }

  function resyncAudio(audio: HTMLAudioElement, desired: DesiredPlayback) {
    if (role === "listener") setListenerVolume(hostMandatedVolumeRef.current);
    if (desired.isPlaying) {
      const elapsed = (Date.now() - new Date(desired.updatedAt).getTime()) / 1000;
      const target = Math.min(desired.currentTime + elapsed, audio.duration || Infinity);
      audio.currentTime = target;
      safePlay(audio);
    } else {
      const settle = playPromiseRef.current ?? Promise.resolve();
      settle.then(() => {
        audio.currentTime = desired.currentTime;
        audio.pause();
      }).catch(() => {});
    }
  }

  function triggerVolumeNudge() {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    setShowVolumeNudge(true);
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = setTimeout(() => setShowVolumeNudge(false), 6000);
  }

  // Called when listener taps "Enable audio" — provides the required user gesture
  async function unlockAudio() {
    const audio = audioRef.current;
    if (!audio) return;

    // Warm up the audio element so future SSE-triggered plays are allowed.
    // On iOS this is the ONLY way to allow non-gesture audio.play() later.
    try {
      audio.volume = hostMandatedVolumeRef.current;
      await audio.play();
      audio.pause();
    } catch {
      // Ignore — element may not have a src yet; the gesture is still registered
    }

    setAudioUnlocked(true);

    // If the host is already playing, catch up immediately
    if (desiredRef.current) resyncAudio(audio, desiredRef.current);
  }

  // ── Media Session ─────────────────────────────────────────────────────────────

  const activeTrackTitle =
    tracks.find((t) => t.assetId === state?.playback.trackId)?.title ?? null;

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: activeTrackTitle ?? "Volum",
      artist: `Room ${code}`,
      album: "Volum",
    });
  }, [activeTrackTitle, code]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState =
      state?.playback.isPlaying ? "playing" : "paused";
  }, [state?.playback.isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (role === "host") {
      navigator.mediaSession.setActionHandler("play", () => {
        const desired = desiredRef.current;
        if (desired) resyncAudio(audio, { ...desired, isPlaying: true });
        else safePlay(audio);
        navigator.mediaSession.playbackState = "playing";
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        const settle = playPromiseRef.current ?? Promise.resolve();
        settle.then(() => audio.pause()).catch(() => {});
        navigator.mediaSession.playbackState = "paused";
      });
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime === undefined) return;
        audio.currentTime = d.seekTime;
        setCurrentTime(d.seekTime);
        post("/api/room/seek", { code, currentTime: d.seekTime });
      });
      navigator.mediaSession.setActionHandler("seekbackward", (d) => {
        const next = Math.max(0, audio.currentTime - (d.seekOffset ?? 10));
        audio.currentTime = next;
        setCurrentTime(next);
        post("/api/room/seek", { code, currentTime: next });
      });
      navigator.mediaSession.setActionHandler("seekforward", (d) => {
        const next = Math.min(audio.duration || Infinity, audio.currentTime + (d.seekOffset ?? 10));
        audio.currentTime = next;
        setCurrentTime(next);
        post("/api/room/seek", { code, currentTime: next });
      });
    } else {
      // Listeners: no-ops keep Media Session alive for background audio
      // but lock-screen buttons do nothing
      navigator.mediaSession.setActionHandler("play", () => {});
      navigator.mediaSession.setActionHandler("pause", () => {});
    }

    return () => {
      try {
        ["play", "pause", "seekto", "seekbackward", "seekforward"].forEach((a) =>
          navigator.mediaSession.setActionHandler(a as MediaSessionAction, null)
        );
      } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, role, post]);

  // ── Visibility-change resync ─────────────────────────────────────────────────

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const audio = audioRef.current;
      const desired = desiredRef.current;
      if (!audio || !desired) return;
      resyncAudio(audio, desired);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SSE connection ────────────────────────────────────────────────────────────

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

      if (role === "host") {
        setListenerVolumes((prev) => {
          const next = { ...prev };
          for (const p of nextState.participants) {
            if (p.role === "listener" && !(p.clientId in next)) next[p.clientId] = 1;
          }
          return next;
        });
      }

      const pb = nextState.playback;
      desiredRef.current = { isPlaying: pb.isPlaying, currentTime: pb.currentTime, updatedAt: pb.updatedAt };
      const audio = audioRef.current;
      // Only sync audio if the listener has unlocked (or is the host)
      if (audio && (role === "host" || audioUnlocked)) resyncAudio(audio, desiredRef.current);
    });

    source.addEventListener("room:play", (e) => {
      const playback = JSON.parse(e.data);
      desiredRef.current = { isPlaying: true, currentTime: playback.currentTime, updatedAt: playback.updatedAt };
      const audio = audioRef.current;
      if (!audio) return;
      if (role === "listener" && !audioUnlocked) return; // wait for user tap
      audio.currentTime = playback.currentTime;
      safePlay(audio);
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    });

    source.addEventListener("room:pause", (e) => {
      const playback = JSON.parse(e.data);
      desiredRef.current = { isPlaying: false, currentTime: playback.currentTime, updatedAt: playback.updatedAt };
      const audio = audioRef.current;
      if (!audio) return;
      const settle = playPromiseRef.current ?? Promise.resolve();
      settle.then(() => { audio.currentTime = playback.currentTime; audio.pause(); }).catch(() => {});
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    });

    source.addEventListener("room:seek", (e) => {
      const playback = JSON.parse(e.data);
      if (desiredRef.current) {
        desiredRef.current = { ...desiredRef.current, currentTime: playback.currentTime, updatedAt: playback.updatedAt };
      }
      const audio = audioRef.current;
      if (audio) audio.currentTime = playback.currentTime;
    });

    source.addEventListener("room:volume", (e) => {
      const { volume: v } = JSON.parse(e.data);
      setMyVolume(v);
      setListenerVolume(v);
      if (v > 0) triggerVolumeNudge();
    });

    return () => source.close();
  }, [code, role, userId, userName, audioUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Audio element listeners ───────────────────────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession) {
        try {
          if (audio.duration && isFinite(audio.duration)) {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate,
              position: audio.currentTime,
            });
          }
        } catch { /* ignore */ }
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);

    // Guard: if something external changes audio.volume on a listener, restore it
    const onVolumeChange = () => {
      if (role !== "listener") return;
      if (settingVolumeRef.current) return;
      const target = hostMandatedVolumeRef.current;
      if (Math.abs(audio.volume - target) > 0.001) {
        settingVolumeRef.current = true;
        audio.volume = target;
        settingVolumeRef.current = false;
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("volumechange", onVolumeChange);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("volumechange", onVolumeChange);
    };
  });

  // ── Host actions ──────────────────────────────────────────────────────────────

  function emitPlay() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/play", { code, currentTime: audio.currentTime, trackId: state?.playback.trackId ?? null });
  }

  function emitPause() {
    const audio = audioRef.current;
    if (!audio) return;
    post("/api/room/pause", { code, currentTime: audio.currentTime });
  }

  function emitSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    const value = Number(e.target.value);
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
    post("/api/room/seek", { code, currentTime: value });
  }

  function emitTrack(trackId: string | null) {
    post("/api/room/track", { code, trackId });
  }

  function handleHostVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setHostVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

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

  const listeners = state?.participants.filter((p) => p.role === "listener") ?? [];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Volume nudge overlay */}
      {role === "listener" && showVolumeNudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6">
          <div className="w-full max-w-sm rounded-3xl border border-violet-500/30 bg-slate-900 p-8 text-center space-y-5 shadow-2xl">
            <div className="text-6xl animate-bounce">🔔</div>
            <h2 className="text-2xl font-bold text-white">Turn up your volume!</h2>
            <p className="text-slate-300 text-sm">
              The host is playing music for you. Please turn up your phone volume.
            </p>
            <button
              onClick={() => setShowVolumeNudge(false)}
              className="w-full rounded-2xl bg-violet-500 py-3 font-semibold text-white hover:bg-violet-400 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
        // ── HOST ───────────────────────────────────────────────────────────────
        <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-5">
            <label className="block space-y-2 text-sm text-slate-300">
              <span>Active track</span>
              <select
                value={state?.playback.trackId ?? ""}
                onChange={(e) => emitTrack(e.target.value || null)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
              >
                <option value="">Select a track</option>
                {tracks.map((t) => (
                  <option key={t.assetId} value={t.assetId}>{t.title}</option>
                ))}
              </select>
            </label>

            <audio
              ref={audioRef}
              playsInline
              src={state?.playback.trackId ? `/api/audio/${state.playback.trackId}` : undefined}
            />

            <div className="flex flex-wrap gap-3">
              <button onClick={emitPlay}
                className="rounded-2xl bg-sky-400 px-5 py-3 font-medium text-slate-950 hover:bg-sky-300 transition-colors">
                ▶ Play
              </button>
              <button onClick={emitPause}
                className="rounded-2xl bg-white px-5 py-3 font-medium text-slate-950 hover:bg-slate-100 transition-colors">
                ⏸ Pause
              </button>
            </div>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>Seek — {formatTime(currentTime)} / {formatTime(duration)}</span>
              <input type="range" min="0" max={duration || 1} step="0.1"
                value={currentTime} onChange={emitSeek} className="w-full accent-sky-400" />
            </label>

            <label className="block space-y-2 text-sm text-slate-300">
              <span>My volume — {Math.round(hostVolume * 100)}%</span>
              <input type="range" min="0" max="1" step="0.01"
                value={hostVolume} onChange={handleHostVolume} className="w-full accent-sky-400" />
            </label>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-4">
            <h2 className="text-xl font-medium text-white">Participants</h2>

            {state?.participants.filter((p) => p.role === "host").map((p) => (
              <div key={p.clientId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-sky-400 uppercase tracking-wide">host</span>
                    <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-rose-400"}`} />
                  </span>
                </div>
              </div>
            ))}

            {listeners.length === 0 ? (
              <p className="text-sm text-slate-500">No listeners yet.</p>
            ) : listeners.map((p) => {
              const vol = listenerVolumes[p.clientId] ?? 1;
              return (
                <div key={p.clientId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm space-y-3">
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
                      {!p.connected && <span className="ml-2 text-rose-400">(offline)</span>}
                    </span>
                    <input type="range" min="0" max="1" step="0.01"
                      value={vol} disabled={!p.connected}
                      onChange={(e) => handleListenerVolume(p.clientId, Number(e.target.value))}
                      className="w-full accent-violet-400 disabled:opacity-40" />
                  </label>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        // ── LISTENER ───────────────────────────────────────────────────────────
        <section className="space-y-6">
          <audio
            ref={audioRef}
            playsInline
            src={state?.playback.trackId ? `/api/audio/${state.playback.trackId}` : undefined}
          />

          {/* ── Audio unlock gate (mobile requires a user gesture first) ── */}
          {!audioUnlocked ? (
            <div className="rounded-3xl border border-sky-500/30 bg-sky-950/40 p-8 text-center space-y-5">
              <div className="text-5xl">🎵</div>
              <h2 className="text-xl font-semibold text-white">Tap to enable audio</h2>
              <p className="text-sm text-slate-400">
                Mobile browsers require a tap before audio can play.
                Tap the button below once so music from the host reaches your device.
              </p>
              <button
                onClick={unlockAudio}
                className="w-full rounded-2xl bg-sky-500 py-4 text-lg font-bold text-white hover:bg-sky-400 active:scale-95 transition-all"
              >
                Enable Audio
              </button>
            </div>
          ) : (
            /* ── Now Playing (shown after unlock) ── */
            <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Now Playing</p>
              {activeTrackTitle ? (
                <>
                  <p className="text-xl font-semibold text-white truncate">{activeTrackTitle}</p>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                      state?.playback.isPlaying
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-slate-700/50 text-slate-400"
                    }`}>
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
                <div className="flex-1 h-2 rounded-full bg-violet-500/20">
                  <div className="h-2 rounded-full bg-violet-400 transition-all"
                    style={{ width: `${Math.round(myVolume * 100)}%` }} />
                </div>
                <span className="text-xs text-slate-400 w-10 text-right">
                  {Math.round(myVolume * 100)}%
                </span>
              </div>
              <p className="text-xs text-slate-600">Volume is set by the host for your device.</p>
            </div>
          )}

          {/* Participants */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-6 space-y-3">
            <h2 className="text-xl font-medium text-white">Participants</h2>
            {state?.participants.map((p) => (
              <div key={p.clientId} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{p.name}</span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs uppercase tracking-wide ${p.role === "host" ? "text-sky-400" : "text-violet-400"}`}>
                      {p.role}
                    </span>
                    <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-rose-400"}`} />
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
