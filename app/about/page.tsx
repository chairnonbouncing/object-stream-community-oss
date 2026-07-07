import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "About & Support" };

const rules = [
  {
    emoji: "🚫",
    title: "No reuploads. Ever.",
    text: "OSC never hosts, downloads, copies, or proxies a single video file. There is no upload button and there never will be.",
  },
  {
    emoji: "▶️",
    title: "Official players only",
    text: "Every episode plays through the official YouTube or Vimeo embedded player. Views, ads, likes, and subscribers all go to the original channel.",
  },
  {
    emoji: "💚",
    title: "Creators keep the credit",
    text: "Every watch page links straight back to the original upload. We're a map to the good stuff, not a copy of it.",
  },
  {
    emoji: "🧭",
    title: "Community-powered, wiki-style",
    text: "Fans build AND maintain the catalog: anyone can fix show metadata or edit public playlists. Every change is version-controlled, so a bad edit is always one restore away. Mods handle the rest.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <div className="space-y-4 pt-6 text-center">
        <h1 className="font-display text-4xl text-cream sm:text-5xl">
          Watch Object Shows <span className="text-osc-green">the right way.</span>
        </h1>
        <p className="mx-auto max-w-xl text-cream/70">
          Object Stream Community is a free, fan-made discovery and watch platform
          for Object Shows — BFDI, Inanimate Insanity, and every hidden gem the
          community digs up. No reuploads. No stolen credit. Just clean embeds,
          playlists, reviews, and community discovery.
        </p>
        <div className="flex justify-center gap-3">
          <ButtonLink href="/discover">Browse the catalog</ButtonLink>
          <ButtonLink href="/submit" variant="outline">
            Submit a video
          </ButtonLink>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule.title} className="rounded-3xl border border-line bg-surface p-5">
            <p className="text-3xl" aria-hidden>
              {rule.emoji}
            </p>
            <h2 className="mt-2 font-display text-xl text-cream">{rule.title}</h2>
            <p className="mt-1 text-sm text-cream/65">{rule.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6" id="support">
        <h2 className="font-display text-2xl text-cream">Support &amp; takedowns</h2>
        <div className="mt-3 space-y-3 text-sm text-cream/70">
          <p>
            <b className="text-cream">Are you a creator?</b> Your videos only appear
            here as official embeds of your own uploads — every play counts on your
            channel. If you&apos;d still like an entry removed from the catalog, use
            the ⚑ Report button on its watch page and a mod will take it down.
          </p>
          <p>
            <b className="text-cream">Found something that doesn&apos;t belong?</b>{" "}
            Broken links, wrong metadata, spam, or anything inappropriate — hit ⚑
            Report and the mod team will review it.
          </p>
          <p>
            <b className="text-cream">Want to help?</b> The best support is filling the
            catalog: submit episodes with good metadata, build playlists in the right
            watch order, and review your favorites so new fans know where to start.
          </p>
        </div>
      </section>
    </div>
  );
}
