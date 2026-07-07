import type { Metadata } from "next";
import { requireUser } from "@/lib/auth-helpers";
import { YouTubePlaylistImporter } from "@/components/import/youtube-playlist-importer";

export const metadata: Metadata = { title: "Import YouTube Playlist" };

export default async function YouTubePlaylistImportPage() {
  const user = await requireUser("/import/youtube-playlist");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-cream sm:text-4xl">
          Import a YouTube playlist
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-cream/60">
          Paste a playlist link, preview every public video, skip anything you do not
          want, and OSC will keep playing through official YouTube embeds. No downloads,
          no reuploads, no hosted thumbnails.
        </p>
      </div>
      <YouTubePlaylistImporter isAdmin={user.isAdmin} />
    </div>
  );
}
