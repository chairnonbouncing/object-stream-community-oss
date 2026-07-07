import { SectionHeading } from "@/components/ui/section-heading";
import { VideoCard } from "@/components/video/video-card";
import type { VideoWithRating } from "@/lib/queries/videos";

export function VideoRow({
  title,
  href,
  videos,
  showShowTitle = true,
}: {
  title: string;
  href?: string;
  videos: VideoWithRating[];
  showShowTitle?: boolean;
}) {
  if (videos.length === 0) return null;

  return (
    <section>
      <SectionHeading title={title} href={href} />
      <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {videos.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            showShowTitle={showShowTitle}
            className="w-60 shrink-0 snap-start sm:w-64"
          />
        ))}
      </div>
    </section>
  );
}
