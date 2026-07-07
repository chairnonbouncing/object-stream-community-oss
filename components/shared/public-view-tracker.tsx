"use client";

import { useEffect } from "react";
import {
  publicViewStorageKey,
  type PublicViewKind,
} from "@/lib/public-view";

export function PublicViewTracker({
  kind,
  targetId,
}: {
  kind: PublicViewKind;
  targetId: string | null | undefined;
}) {
  useEffect(() => {
    if (!targetId) return;
    const key = publicViewStorageKey(kind, targetId);
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage can be unavailable; the server's short cookie cooldown still applies.
    }

    void fetch("/api/public-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, targetId }),
      keepalive: true,
    }).catch(() => {});
  }, [kind, targetId]);

  return null;
}
