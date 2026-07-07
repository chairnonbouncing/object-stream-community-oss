"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addToPlaylist, createPlaylistAndAdd } from "@/actions/playlists";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type PlaylistPickerItem = {
  id: string;
  name: string;
  itemCount: number;
  containsVideo: boolean;
};

export function AddToPlaylist({
  videoId,
  playlists,
  signedIn,
}: {
  videoId: string;
  playlists: PlaylistPickerItem[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(
    () => new Set(playlists.filter((p) => p.containsVideo).map((p) => p.id))
  );
  const [message, setMessage] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="md"
        onClick={() => {
          if (!signedIn) {
            router.push(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
            return;
          }
          setOpen((v) => !v);
        }}
      >
        ＋ Add to playlist
      </Button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 z-50 mt-2 w-72 rounded-2xl border border-line bg-surface-2 p-3 shadow-xl shadow-black/50">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cream/40">
              Your playlists
            </p>
            {playlists.length === 0 ? (
              <p className="px-1 pb-2 text-sm text-cream/50">No playlists yet.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {playlists.map((p) => {
                  const isIn = added.has(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        disabled={isIn || pending}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await addToPlaylist(p.id, videoId);
                            setMessage(result.ok ? result.message ?? "Added!" : result.error);
                            if (result.ok) setAdded((s) => new Set(s).add(p.id));
                          })
                        }
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold",
                          isIn
                            ? "cursor-default text-osc-green"
                            : "text-cream/85 hover:bg-white/10"
                        )}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="ml-2 shrink-0 text-xs text-cream/40">
                          {isIn ? "✓ in list" : `${p.itemCount} videos`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                startTransition(async () => {
                  const result = await createPlaylistAndAdd(newName, videoId);
                  setMessage(result.ok ? result.message ?? "Created!" : result.error);
                  if (result.ok) {
                    setNewName("");
                    router.refresh();
                  }
                });
              }}
              className="mt-2 flex gap-2 border-t border-line pt-2"
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New playlist name…"
                maxLength={80}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-cream placeholder:text-cream/35 focus:border-osc-purple focus:outline-none"
              />
              <button
                type="submit"
                disabled={pending || !newName.trim()}
                className="shrink-0 rounded-lg bg-osc-purple px-3 text-sm font-bold text-white disabled:opacity-50"
              >
                ＋
              </button>
            </form>

            {message ? <p className="mt-2 text-xs text-osc-star">{message}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
