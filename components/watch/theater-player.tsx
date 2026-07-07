"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { buildEmbedUrl, type VideoProvider } from "@/lib/video-url";
import { cn } from "@/lib/cn";

const YT_ORIGIN = "https://www.youtube-nocookie.com";
const VIMEO_ORIGIN = "https://player.vimeo.com";
const NETFLIX_RED = "#e50914";
const CONTROLS_HIDE_MS = 3000;
const SPEEDS = [1, 1.25, 1.5, 2, 0.75] as const;
const RESUME_SAVE_MS = 5000;
const RESUME_MIN_SECONDS = 30;

/* Resume-where-you-left-off, stored per video in localStorage. */
function resumeKey(provider: string, providerVideoId: string) {
  return `osc-resume-${provider}-${providerVideoId}`;
}

function readResume(provider: string, providerVideoId: string): number {
  try {
    const raw = localStorage.getItem(resumeKey(provider, providerVideoId));
    const t = raw ? Number(raw) : 0;
    return Number.isFinite(t) && t > RESUME_MIN_SECONDS ? t : 0;
  } catch {
    return 0;
  }
}

function writeResume(provider: string, providerVideoId: string, time: number, duration: number) {
  try {
    // Near the end (or done) means "watched" — a stale resume point would just
    // dump the next visit at the credits.
    if (duration > 0 && (time > duration * 0.95 || duration - time < 20)) {
      localStorage.removeItem(resumeKey(provider, providerVideoId));
    } else if (time > RESUME_MIN_SECONDS) {
      localStorage.setItem(resumeKey(provider, providerVideoId), String(Math.floor(time)));
    }
  } catch {
    // storage unavailable — resume just won't persist
  }
}

export type EpisodeEntry = {
  videoId: string;
  href: string;
  title: string;
  label: string | null;
  thumb: string;
  current: boolean;
};

/* ------------------------------------------------------------------ */
/* Theater flag lives in sessionStorage via a tiny external store so    */
/* fullscreen survives the navigation that auto-advance performs.       */
/* ------------------------------------------------------------------ */
const theaterListeners = new Set<() => void>();
const theaterStore = {
  subscribe(listener: () => void) {
    theaterListeners.add(listener);
    return () => theaterListeners.delete(listener);
  },
  get(): boolean {
    try {
      return sessionStorage.getItem("osc-theater") === "1";
    } catch {
      return false;
    }
  },
  set(value: boolean) {
    try {
      if (value) sessionStorage.setItem("osc-theater", "1");
      else sessionStorage.removeItem("osc-theater");
    } catch {
      // storage unavailable — theater just won't persist across episodes
    }
    theaterListeners.forEach((l) => l());
  },
};

const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/* ---------------------------- icons ------------------------------- */

function SkipIcon({ forward }: { forward: boolean }) {
  return (
    <span className="relative inline-flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className={cn("h-full w-full", forward && "-scale-x-100")}
        aria-hidden
      >
        {/* near-full circle with a gap at the top, arrowhead at the gap */}
        <path d="M 9.2 3.4 A 9 9 0 1 0 12 3" />
        <polygon points="10.2,0.6 10.2,6.2 5.8,3.4" fill="currentColor" stroke="none" />
      </svg>
      <span className="absolute text-sm font-bold sm:text-base">10</span>
    </span>
  );
}

function PlayPauseIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-16 w-16 sm:h-20 sm:w-20" aria-hidden>
      <rect x="6" y="4" width="4" height="16" rx="0.5" />
      <rect x="14" y="4" width="4" height="16" rx="0.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-16 w-16 sm:h-20 sm:w-20" aria-hidden>
      <path d="M7 4.5 L20 12 L7 19.5 Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

export function TheaterPlayer({
  provider,
  providerVideoId,
  vimeoHash,
  title,
  theaterTitle,
  autoplay = false,
  nextHref,
  episodes,
  episodesTitle,
}: {
  provider: VideoProvider;
  providerVideoId: string;
  vimeoHash?: string;
  title: string;
  /** Netflix-style label shown in fullscreen, e.g. `S1:E3 “Barriers and Pitfalls”`. */
  theaterTitle: string;
  autoplay?: boolean;
  nextHref?: string;
  episodes: EpisodeEntry[];
  episodesTitle: string;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const theater = useSyncExternalStore(
    theaterStore.subscribe,
    theaterStore.get,
    () => false
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const advancedRef = useRef(false);
  // Entering/leaving theater swaps the iframe src (to drop the provider's own
  // chrome), which reloads the player — this carries playback state across.
  const pendingRestoreRef = useRef<{
    time: number;
    wasPlaying: boolean;
    cc: boolean;
    muted: boolean;
    speed: number;
  } | null>(null);
  const srcSwapAtRef = useRef(0);

  const [playing, setPlaying] = useState(autoplay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [cc, setCc] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activityTick, setActivityTick] = useState(0);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [scrubHover, setScrubHover] = useState<{ x: number; time: number } | null>(null);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  // Live mirrors for use inside stable callbacks (state itself would churn
  // their identity several times a second during playback).
  const playbackRef = useRef({ time: 0, playing: autoplay });
  const resumeAppliedRef = useRef(false);
  const lastResumeSaveRef = useRef(0);
  const scrubDragRef = useRef(false);

  /* ------------------------- player wire -------------------------- */

  const sendToPlayer = useCallback(
    (
      action: "play" | "pause" | "seek" | "ccOn" | "ccOff" | "mute" | "unmute" | "rate",
      value?: number
    ) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      if (provider === "youtube") {
        const [func, args]: [string, unknown[]] =
          action === "play"
            ? ["playVideo", []]
            : action === "pause"
              ? ["pauseVideo", []]
              : action === "seek"
                ? ["seekTo", [value ?? 0, true]]
                : action === "ccOn"
                  ? ["loadModule", ["captions"]]
                  : action === "ccOff"
                    ? ["unloadModule", ["captions"]]
                    : action === "mute"
                      ? ["mute", []]
                      : action === "unmute"
                        ? ["unMute", []]
                        : ["setPlaybackRate", [value ?? 1]];
        target.postMessage(JSON.stringify({ event: "command", func, args }), YT_ORIGIN);
      } else {
        const payload =
          action === "seek"
            ? { method: "seekTo", value: value ?? 0 }
            : action === "ccOn"
              ? { method: "enableTextTrack", value: "en" }
              : action === "ccOff"
                ? { method: "disableTextTrack" }
                : action === "mute"
                  ? { method: "setVolume", value: 0 }
                  : action === "unmute"
                    ? { method: "setVolume", value: 1 }
                    : action === "rate"
                      ? { method: "setPlaybackRate", value: value ?? 1 }
                      : { method: action };
        target.postMessage(JSON.stringify(payload), VIMEO_ORIGIN);
      }
    },
    [provider]
  );

  useEffect(() => {
    let ytConnected = false;

    const advance = () => {
      try {
        localStorage.removeItem(resumeKey(provider, providerVideoId));
      } catch {
        // ignore
      }
      if (!nextHref || advancedRef.current) return;
      advancedRef.current = true;
      router.push(nextHref);
    };

    // First contact with the player on a fresh page load: jump back to where
    // the viewer left off last time (a few seconds earlier for context).
    const maybeResume = () => {
      if (resumeAppliedRef.current) return;
      resumeAppliedRef.current = true;
      if (pendingRestoreRef.current) return; // theater swap restores itself
      const t = readResume(provider, providerVideoId);
      if (t > 0) {
        sendToPlayer("seek", Math.max(0, t - 3));
        setResumedFrom(t);
      }
    };

    const saveProgress = (time: number, dur: number) => {
      const now = Date.now();
      if (now - lastResumeSaveRef.current < RESUME_SAVE_MS) return;
      lastResumeSaveRef.current = now;
      writeResume(provider, providerVideoId, time, dur);
    };

    // After a theater-toggle src swap, put the fresh player back where the
    // old one was: same position, same play state, same captions choice.
    // The time gate skips stray messages from the outgoing player.
    const applyRestore = () => {
      const restore = pendingRestoreRef.current;
      if (!restore) return;
      if (Date.now() - srcSwapAtRef.current < 250) return;
      pendingRestoreRef.current = null;
      if (restore.time > 0) sendToPlayer("seek", restore.time);
      sendToPlayer(restore.wasPlaying ? "play" : "pause");
      if (restore.cc) sendToPlayer("ccOn");
      if (restore.muted) sendToPlayer("mute");
      if (restore.speed !== 1) sendToPlayer("rate", restore.speed);
    };

    const onMessage = (e: MessageEvent) => {
      let data: unknown;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (typeof data !== "object" || data === null) return;
      const msg = data as {
        event?: string;
        info?: unknown;
        method?: string;
        data?: unknown;
      };

      if (provider === "youtube") {
        if (e.origin !== YT_ORIGIN) return;
        ytConnected = true;
        maybeResume();
        applyRestore();
        if (msg.event === "onStateChange" && typeof msg.info === "number") {
          const isPlaying = msg.info === 1 || msg.info === 3;
          setPlaying(isPlaying);
          playbackRef.current.playing = isPlaying;
          if (msg.info === 0) advance();
        }
        if (
          (msg.event === "infoDelivery" || msg.event === "initialDelivery") &&
          typeof msg.info === "object" &&
          msg.info !== null
        ) {
          const info = msg.info as {
            currentTime?: number;
            duration?: number;
            playerState?: number;
          };
          if (typeof info.currentTime === "number") {
            if (!scrubDragRef.current) setCurrentTime(info.currentTime);
            playbackRef.current.time = info.currentTime;
            saveProgress(info.currentTime, typeof info.duration === "number" ? info.duration : 0);
          }
          if (typeof info.duration === "number" && info.duration > 0) {
            setDuration(info.duration);
          }
          if (typeof info.playerState === "number") {
            const isPlaying = info.playerState === 1 || info.playerState === 3;
            setPlaying(isPlaying);
            playbackRef.current.playing = isPlaying;
            if (info.playerState === 0) advance();
          }
        }
      } else {
        if (e.origin !== VIMEO_ORIGIN) return;
        if (msg.event === "ready") {
          for (const value of ["finish", "playProgress", "play", "pause"]) {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ method: "addEventListener", value }),
              VIMEO_ORIGIN
            );
          }
          maybeResume();
          applyRestore();
        }
        if (msg.event === "playProgress" && typeof msg.data === "object" && msg.data) {
          const d = msg.data as { seconds?: number; duration?: number };
          if (typeof d.seconds === "number") {
            if (!scrubDragRef.current) setCurrentTime(d.seconds);
            playbackRef.current.time = d.seconds;
            saveProgress(d.seconds, typeof d.duration === "number" ? d.duration : 0);
          }
          if (typeof d.duration === "number" && d.duration > 0) setDuration(d.duration);
          applyRestore();
        }
        if (msg.event === "play") {
          setPlaying(true);
          playbackRef.current.playing = true;
        }
        if (msg.event === "pause") {
          setPlaying(false);
          playbackRef.current.playing = false;
        }
        if (msg.event === "finish") advance();
      }
    };

    window.addEventListener("message", onMessage);

    // YouTube only pushes events after a "listening" handshake, and a single
    // post can land before the widget API has booted — re-post until answered.
    let handshake: ReturnType<typeof setInterval> | undefined;
    if (provider === "youtube") {
      handshake = setInterval(() => {
        if (ytConnected) {
          clearInterval(handshake);
          return;
        }
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: "listening", id: "osc-player", channel: "widget" }),
          YT_ORIGIN
        );
      }, 500);
    }

    return () => {
      window.removeEventListener("message", onMessage);
      if (handshake) clearInterval(handshake);
    };
    // `theater` is a dep because toggling it swaps the iframe src — the new
    // player needs a fresh handshake before it will talk to us.
  }, [provider, providerVideoId, nextHref, router, theater, sendToPlayer]);

  /* ------------------------ theater chrome ------------------------ */

  const showControls = useCallback(() => {
    setControlsVisible(true);
    setActivityTick((t) => t + 1);
  }, []);

  // Netflix behavior: chrome fades only during playback; while paused (or
  // with the episodes sheet open) it stays up. Any activity re-arms the timer.
  useEffect(() => {
    if (!theater || !controlsVisible || !playing || episodesOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [theater, controlsVisible, playing, episodesOpen, activityTick]);

  const enterTheater = () => {
    pendingRestoreRef.current = {
      time: playbackRef.current.time,
      wasPlaying: playbackRef.current.playing,
      cc,
      muted,
      speed,
    };
    srcSwapAtRef.current = Date.now();
    theaterStore.set(true);
    showControls();
    containerRef.current?.requestFullscreen?.().catch(() => {
      // No native fullscreen (iOS Safari etc.) — the fixed takeover covers it.
    });
  };

  const exitTheater = useCallback(() => {
    pendingRestoreRef.current = {
      time: playbackRef.current.time,
      wasPlaying: playbackRef.current.playing,
      cc: false, // normal mode has the provider's own CC button again
      muted,
      speed,
    };
    srcSwapAtRef.current = Date.now();
    theaterStore.set(false);
    setEpisodesOpen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [muted, speed]);

  // Keep our state honest when the browser exits fullscreen on its own (Esc).
  useEffect(() => {
    if (!theater) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) exitTheater();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitTheater();
    };
    const onActivity = () => showControls();

    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointermove", onActivity);
    window.addEventListener("touchstart", onActivity);

    document.documentElement.style.overflow = "hidden";

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointermove", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.documentElement.style.overflow = "";
    };
  }, [theater, exitTheater, showControls]);

  /* ---------------------------- render ----------------------------- */

  const src = mounted
    ? buildEmbedUrl(provider, providerVideoId, {
        autoplay,
        jsApi: true,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
        vimeoHash,
        // Theater hides the provider's chrome (their documented params) — our
        // overlay is the only UI; captions re-apply via the API after reload.
        hideControls: theater,
      })
    : undefined;

  const remaining = duration > 0 ? duration - currentTime : 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const seekBy = useCallback(
    (delta: number) => {
      const target = Math.min(
        Math.max(0, playbackRef.current.time + delta),
        duration || Infinity
      );
      setCurrentTime(target);
      playbackRef.current.time = target;
      sendToPlayer("seek", target);
      showControls();
    },
    [duration, sendToPlayer, showControls]
  );

  const togglePlay = useCallback(() => {
    const next = !playbackRef.current.playing;
    sendToPlayer(next ? "play" : "pause");
    setPlaying(next);
    playbackRef.current.playing = next;
    showControls();
  }, [sendToPlayer, showControls]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sendToPlayer(m ? "unmute" : "mute");
      return !m;
    });
    showControls();
  }, [sendToPlayer, showControls]);

  const toggleCc = useCallback(() => {
    setCc((on) => {
      sendToPlayer(on ? "ccOff" : "ccOn");
      return !on;
    });
    showControls();
  }, [sendToPlayer, showControls]);

  const cycleSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = SPEEDS[(SPEEDS.indexOf(current as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
      sendToPlayer("rate", next);
      return next;
    });
    showControls();
  }, [sendToPlayer, showControls]);

  /* YouTube-style keyboard shortcuts, active on the whole watch page.
     Space/K play-pause · ←/→ or J/L ±10s · F theater · M mute · C captions. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "arrowleft":
        case "j":
          e.preventDefault();
          seekBy(-10);
          break;
        case "arrowright":
        case "l":
          e.preventDefault();
          seekBy(10);
          break;
        case "f":
          e.preventDefault();
          if (theater) exitTheater();
          else enterTheater();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "c":
          toggleCc();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (resumedFrom == null) return;
    const timer = setTimeout(() => setResumedFrom(null), 5000);
    return () => clearTimeout(timer);
  }, [resumedFrom]);

  const timeAtPointer = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
    return { x: clientX - rect.left, time: fraction * duration };
  };

  const overlayButton =
    "pointer-events-auto text-white/90 transition hover:scale-110 hover:text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]";

  return (
    <div
      ref={containerRef}
      className={cn(
        theater
          ? "fixed inset-0 z-[95] bg-black"
          : "relative aspect-video w-full overflow-hidden rounded-3xl border-2 border-white/15 bg-black shadow-2xl shadow-black/50",
        theater && !controlsVisible && "cursor-none"
      )}
    >
      {mounted ? (
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-cream/30">
          Loading player…
        </div>
      )}

      {resumedFrom != null ? (
        <p className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-black/75 px-3 py-1.5 text-xs font-bold text-white/90 backdrop-blur">
          ⏱ Resumed from {formatClock(resumedFrom)}
        </p>
      ) : null}

      {!theater ? (
        <button
          onClick={enterTheater}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-white/85 backdrop-blur transition hover:bg-black/80 hover:text-white"
          title="Theater fullscreen"
          aria-label="Enter theater fullscreen"
        >
          ⛶
        </button>
      ) : (
        <>
          {/* One full-screen chrome layer. Capture phase swallows every click
              while hidden (so invisible buttons can't fire) and just reveals
              the controls; clicks on empty areas while visible hide them. */}
          <div
            onClickCapture={(e) => {
              if (!controlsVisible) {
                e.stopPropagation();
                showControls();
              }
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setControlsVisible(false);
            }}
            className={cn(
              "absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
              controlsVisible ? "opacity-100" : "opacity-0"
            )}
          >
            {/* Top bar */}
            <div className="pointer-events-none flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent px-4 pb-10 pt-4 sm:px-6">
              <button
                onClick={exitTheater}
                className={cn(overlayButton, "text-3xl leading-none")}
                aria-label="Back"
              >
                ←
              </button>
              <p className="flex-1 text-center text-base font-semibold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-lg">
                {theaterTitle}
              </p>
              <span className="w-8" aria-hidden />
            </div>

            {/* Center controls */}
            <div className="pointer-events-none flex items-center justify-center gap-12 sm:gap-20">
              <button
                onClick={() => seekBy(-10)}
                className={overlayButton}
                aria-label="Back 10 seconds"
              >
                <SkipIcon forward={false} />
              </button>
              <button
                onClick={togglePlay}
                className={overlayButton}
                aria-label={playing ? "Pause" : "Play"}
              >
                <PlayPauseIcon playing={playing} />
              </button>
              <button
                onClick={() => seekBy(10)}
                className={overlayButton}
                aria-label="Forward 10 seconds"
              >
                <SkipIcon forward />
              </button>
            </div>

            {/* Bottom: scrubber + actions */}
            <div className="pointer-events-none space-y-4 bg-gradient-to-t from-black/85 to-transparent px-4 pb-5 pt-12 sm:px-8">
              {duration > 0 ? (
                <div className="pointer-events-auto flex items-center gap-3">
                  <div
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={Math.floor(duration)}
                    aria-valuenow={Math.floor(currentTime)}
                    tabIndex={0}
                    className="group relative h-5 flex-1 cursor-pointer touch-none"
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      scrubDragRef.current = true;
                      const { time } = timeAtPointer(e.clientX, e.currentTarget);
                      setCurrentTime(time);
                      showControls();
                    }}
                    onPointerMove={(e) => {
                      const at = timeAtPointer(e.clientX, e.currentTarget);
                      setScrubHover(at);
                      if (scrubDragRef.current) {
                        setCurrentTime(at.time);
                        showControls();
                      }
                    }}
                    onPointerUp={(e) => {
                      if (!scrubDragRef.current) return;
                      scrubDragRef.current = false;
                      const { time } = timeAtPointer(e.clientX, e.currentTarget);
                      setCurrentTime(time);
                      playbackRef.current.time = time;
                      sendToPlayer("seek", time);
                      showControls();
                    }}
                    onPointerLeave={() => setScrubHover(null)}
                  >
                    {scrubHover ? (
                      <span
                        className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md bg-black/85 px-2 py-0.5 text-xs font-bold text-white tabular-nums"
                        style={{ left: scrubHover.x }}
                      >
                        {formatClock(scrubHover.time)}
                      </span>
                    ) : null}
                    <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/30 transition-all group-hover:h-1.5" />
                    <div
                      className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full transition-all group-hover:h-1.5"
                      style={{ width: `${progress * 100}%`, background: NETFLIX_RED }}
                    />
                    <div
                      className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow transition-transform group-hover:scale-110"
                      style={{
                        left: `calc(${progress * 100}% - 8px)`,
                        background: NETFLIX_RED,
                      }}
                    />
                  </div>
                  <span className="min-w-16 text-right text-sm font-semibold text-white tabular-nums">
                    {formatClock(remaining)}
                  </span>
                </div>
              ) : null}

              <div className="flex items-center justify-center gap-10 text-sm font-bold text-white/90 sm:gap-16">
                {episodes.length > 1 ? (
                  <button
                    onClick={() => {
                      setEpisodesOpen(true);
                      showControls();
                    }}
                    className={cn(overlayButton, "flex items-center gap-2")}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                      <rect x="3" y="7" width="14" height="12" rx="1.5" />
                      <path d="M7 5 h14 v12 h-2 V7 H7 Z" opacity="0.6" />
                    </svg>
                    Episodes
                  </button>
                ) : null}
                <button
                  onClick={cycleSpeed}
                  title="Playback speed"
                  className={cn(
                    overlayButton,
                    "flex items-center gap-2",
                    speed !== 1 && "text-white underline underline-offset-4"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path d="M4 13 a 8 8 0 1 1 16 0" />
                    <path d="M12 13 L16 8" strokeLinecap="round" />
                  </svg>
                  Speed{speed !== 1 ? ` · ${speed}×` : ""}
                </button>
                <button
                  onClick={toggleMute}
                  aria-pressed={muted}
                  title="Mute"
                  className={cn(
                    overlayButton,
                    "flex items-center gap-2",
                    muted && "text-white underline underline-offset-4"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path d="M4 9.5 v5 h3.5 L12 19 V5 L7.5 9.5 Z" fill="currentColor" stroke="none" />
                    {muted ? (
                      <path d="M15.5 9.5 L20.5 14.5 M20.5 9.5 L15.5 14.5" />
                    ) : (
                      <path d="M15.5 9 a 4.5 4.5 0 0 1 0 6 M17.5 6.5 a 8 8 0 0 1 0 11" />
                    )}
                  </svg>
                  {muted ? "Muted" : "Mute"}
                </button>
                <button
                  onClick={toggleCc}
                  aria-pressed={cc}
                  title="Toggles captions when the video provides them"
                  className={cn(
                    overlayButton,
                    "flex items-center gap-2",
                    cc && "text-white underline underline-offset-4"
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                    <path d="M10.5 10.2 a 2.4 2.4 0 1 0 0 3.6 M17 10.2 a 2.4 2.4 0 1 0 0 3.6" />
                  </svg>
                  Subtitles{cc ? " · on" : ""}
                </button>
                {nextHref ? (
                  <button
                    onClick={() => router.push(nextHref)}
                    className={cn(overlayButton, "flex items-center gap-2")}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                      <path d="M5 4.5 L15 12 L5 19.5 Z" />
                      <rect x="16.5" y="4.5" width="2.5" height="15" rx="0.5" />
                    </svg>
                    Next episode
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Episodes sheet */}
          {episodesOpen ? (
            <>
              <div
                className="absolute inset-0 bg-black/50"
                onClick={() => setEpisodesOpen(false)}
                aria-hidden
              />
              <aside className="absolute bottom-0 right-0 top-0 w-80 max-w-[85vw] overflow-y-auto border-l border-white/10 bg-black/95 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="truncate font-display text-lg text-white">
                    {episodesTitle}
                  </p>
                  <button
                    onClick={() => setEpisodesOpen(false)}
                    className="text-xl text-white/70 hover:text-white"
                    aria-label="Close episodes"
                  >
                    ✕
                  </button>
                </div>
                <ol className="space-y-1">
                  {episodes.map((ep) => (
                    <li key={ep.videoId}>
                      <button
                        onClick={() => {
                          setEpisodesOpen(false);
                          if (!ep.current) router.push(ep.href);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl p-2 text-left transition",
                          ep.current
                            ? "bg-white/15 ring-1 ring-white/40"
                            : "hover:bg-white/10"
                        )}
                        aria-current={ep.current ? "true" : undefined}
                      >
                        <img
                          src={ep.thumb}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-12 w-20 shrink-0 rounded-lg object-cover"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-white">
                            {ep.title}
                          </span>
                          {ep.label ? (
                            <span className="block text-xs text-white/50">{ep.label}</span>
                          ) : null}
                        </span>
                        {ep.current ? (
                          <span className="ml-auto shrink-0 text-xs font-bold text-white/70">
                            ▶
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
