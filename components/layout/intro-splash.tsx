"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const SEEN_KEY = "osc-intro-seen";
const emptySubscribe = () => () => {};

/** True on the client when the intro hasn't played this session and the
 *  visitor is okay with motion. Always false during SSR — no hydration flash. */
function useShouldShowIntro(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        if (sessionStorage.getItem(SEEN_KEY) === "1") return false;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
        return true;
      } catch {
        return false;
      }
    },
    () => false
  );
}

/**
 * Plays /videos/opening.mp4 full-screen once per browser session when the
 * site is opened. Tries with sound first; if the browser blocks unmuted
 * autoplay it falls back to muted with an unmute button. Skippable, and
 * disappears silently if the file is missing.
 */
export function IntroSplash() {
  const eligible = useShouldShowIntro();
  const [dismissed, setDismissed] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const show = eligible && !dismissed;

  const dismiss = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // storage unavailable — the overlay still closes for this page
    }
    setDismissed(true);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !show) return;
    video.muted = false;
    video.play().catch(() => {
      // Unmuted autoplay blocked — retry muted, bail entirely if even that fails.
      video.muted = true;
      setMuted(true);
      video.play().catch(() => dismiss());
    });
  }, [show]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
      role="dialog"
      aria-label="Object Stream Community opening"
    >
      <video
        ref={videoRef}
        src="/videos/opening.mp4"
        playsInline
        onEnded={dismiss}
        onError={dismiss}
        className="h-full w-full object-contain"
      />
      <div className="absolute bottom-6 right-6 flex items-center gap-3">
        {muted ? (
          <button
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = false;
              setMuted(false);
            }}
            className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
          >
            🔊 Unmute
          </button>
        ) : null}
        <button
          onClick={dismiss}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/25"
        >
          Skip intro ▶
        </button>
      </div>
    </div>
  );
}
