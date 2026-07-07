import { getSessionUser } from "@/lib/auth-helpers";
import { resolveThumbnail } from "@/lib/video-url";
import {
  getFeaturedVideos,
  getGenreRows,
  getHighlyRatedVideos,
  getMostMarkedWatchedVideos,
  getRecentVideos,
  getShortEpisodeVideos,
} from "@/lib/queries/home";
import { getCompleteShowSummaries, getShowSummaries } from "@/lib/queries/shows";
import { getBingeablePlaylists, getPopularPlaylists } from "@/lib/queries/playlists";
import { getRecentlyUpdatedWikiPages } from "@/lib/queries/wiki";
import { HeroCarousel, type HeroItem } from "@/components/home/hero-carousel";
import { VideoRow } from "@/components/video/video-row";
import { ShowCard } from "@/components/shows/show-card";
import { PlaylistCard } from "@/components/playlists/playlist-card";
import { WikiCard } from "@/components/wiki/wiki-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { ButtonLink } from "@/components/ui/button";

export default async function HomePage() {
  const user = await getSessionUser();
  const [
    featured,
    recent,
    mostWatched,
    highlyRated,
    shortEpisodes,
    shows,
    completeShows,
    playlists,
    bingeablePlaylists,
    recentWikiPages,
    genreRows,
  ] = await Promise.all([
    getFeaturedVideos(5),
    getRecentVideos(12),
    getMostMarkedWatchedVideos(12),
    getHighlyRatedVideos(12),
    getShortEpisodeVideos(12),
    getShowSummaries({ take: 8, sort: "episodes" }),
    getCompleteShowSummaries(8),
    getPopularPlaylists(8),
    getBingeablePlaylists(8),
    getRecentlyUpdatedWikiPages({ take: 8 }),
    getGenreRows(4, 12),
  ]);

  if (recent.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 py-24 text-center">
        <h1 className="max-w-2xl font-display text-4xl text-cream sm:text-6xl">
          Watch Object Shows <span className="text-osc-green">the right way.</span>
        </h1>
        <p className="max-w-xl text-cream/60">
          No reuploads. No stolen credit. Just clean embeds, playlists, reviews, and
          community discovery. The catalog is brand new — add the first episode!
        </p>
        <div className="flex gap-3">
          <ButtonLink href="/submit" size="lg">
            Submit the first video
          </ButtonLink>
          <ButtonLink href="/about" variant="outline" size="lg">
            How it works
          </ButtonLink>
        </div>
      </div>
    );
  }

  const heroItems: HeroItem[] = featured.map((v) => ({
    id: v.id,
    title: v.episodeTitle ?? v.showTitle,
    showTitle: v.showTitle,
    showSlug: v.showSlug,
    description: v.description,
    genreTags: v.genreTags,
    thumb: resolveThumbnail(v),
  }));

  return (
    <div className="space-y-12">
      <HeroCarousel items={heroItems} signedIn={Boolean(user)} />

      <section className="rounded-3xl border border-line bg-surface/60 px-5 py-4">
        <form action="/discover" className="flex flex-wrap items-center gap-3">
          <p className="font-display text-lg text-cream">Looking for something?</p>
          <input
            type="search"
            name="q"
            placeholder="Search shows, episodes, descriptions, tags…"
            className="min-w-56 flex-1 rounded-full border border-line bg-night px-5 py-2.5 text-sm text-cream placeholder:text-cream/35 focus:border-osc-purple focus:outline-none focus:ring-2 focus:ring-osc-purple/40"
            aria-label="Search the catalog"
          />
          <ButtonLink href="/discover" variant="ghost" size="sm">
            or browse everything →
          </ButtonLink>
        </form>
      </section>

      {shows.length > 0 ? (
        <section>
          <SectionHeading title="Featured Shows" href="/shows" />
          <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {shows.map((s) => (
              <ShowCard
                key={s.showSlug}
                show={s}
                className="w-60 shrink-0 snap-start sm:w-64"
              />
            ))}
          </div>
        </section>
      ) : null}

      <VideoRow title="Recently Added" href="/discover" videos={recent} />
      <VideoRow
        title="Most Marked Watched"
        href="/discover?sort=watched"
        videos={mostWatched}
      />
      <VideoRow
        title="Highly Rated"
        href="/discover?sort=rating"
        videos={highlyRated}
      />
      <VideoRow
        title="Short Episodes"
        href="/discover?runtime=short&sort=watched"
        videos={shortEpisodes}
      />

      {completeShows.length > 0 ? (
        <section>
          <SectionHeading
            title="Complete Shows"
            href="/shows?status=Completed&sort=rating"
          />
          <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {completeShows.map((s) => (
              <ShowCard
                key={s.showSlug}
                show={s}
                className="w-60 shrink-0 snap-start sm:w-64"
              />
            ))}
          </div>
        </section>
      ) : null}

      {playlists.length > 0 ? (
        <section>
          <SectionHeading title="Popular Playlists" href="/playlists" />
          <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {playlists.map((p) => (
              <div key={p.id} className="w-60 shrink-0 snap-start sm:w-64">
                <PlaylistCard playlist={p} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {bingeablePlaylists.length > 0 ? (
        <section>
          <SectionHeading
            title="Bingeable Playlists"
            href="/playlists?sort=saves"
          />
          <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {bingeablePlaylists.map((p) => (
              <div key={p.id} className="w-60 shrink-0 snap-start sm:w-64">
                <PlaylistCard playlist={p} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {recentWikiPages.length > 0 ? (
        <section>
          <SectionHeading title="Recently Updated Wiki" href="/wiki" />
          <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {recentWikiPages.map((page) => (
              <WikiCard
                key={page.id}
                page={page}
                compact
                className="w-72 shrink-0 snap-start sm:w-80"
              />
            ))}
          </div>
        </section>
      ) : null}

      {genreRows.map(({ genre, videos }) => (
        <VideoRow
          key={genre}
          title={genre.charAt(0).toUpperCase() + genre.slice(1)}
          href={`/discover?genre=${encodeURIComponent(genre)}`}
          videos={videos}
        />
      ))}
    </div>
  );
}
