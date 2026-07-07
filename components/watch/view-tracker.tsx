import { PublicViewTracker } from "@/components/shared/public-view-tracker";

export function ViewTracker({ videoId }: { videoId: string }) {
  return <PublicViewTracker kind="video" targetId={videoId} />;
}
