import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-surface/40">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-cream/50 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-lg text-cream/80">Object Stream Community</p>
          <p className="mt-1 max-w-xl">
            No reuploads. No stolen credit. Every video plays through the official
            YouTube or Vimeo player, so creators keep their views. OSC hosts nothing.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 font-bold" aria-label="Footer">
          <Link href="/discover" className="hover:text-cream">Discover</Link>
          <Link href="/shows" className="hover:text-cream">Shows</Link>
          <Link href="/playlists" className="hover:text-cream">Playlists</Link>
          <Link href="/submit" className="hover:text-cream">Submit</Link>
          <Link href="/about" className="hover:text-cream">About &amp; Support</Link>
        </nav>
      </div>
    </footer>
  );
}
