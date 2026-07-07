import Link from "next/link";
import { formatDate } from "@/lib/format";
import { deleteOwnReview } from "@/actions/reviews";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ReportButton } from "@/components/shared/report-button";
import { StarDisplay } from "@/components/video/star-display";

export type ReviewWithUser = {
  id: string;
  userId: string;
  rating: number | null;
  text: string;
  isHidden: boolean;
  createdAt: Date;
  user: { username: string; avatarUrl: string | null };
};

export function ReviewList({
  reviews,
  viewerId,
}: {
  reviews: ReviewWithUser[];
  viewerId: string | null;
}) {
  if (reviews.length === 0) {
    return (
      <p className="text-sm text-cream/50">
        No reviews yet — be the first to share your take!
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {reviews.map((review) => {
        const own = review.userId === viewerId;
        return (
          <li
            key={review.id}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/profile/${review.user.username}`}
                className="flex items-center gap-2 font-bold text-cream hover:text-osc-blue"
              >
                <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-osc-purple-deep text-xs">
                  {review.user.avatarUrl ? (
                    <img
                      src={review.user.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    review.user.username.slice(0, 1).toUpperCase()
                  )}
                </span>
                @{review.user.username}
              </Link>
              {review.rating != null ? (
                <StarDisplay avg={review.rating} />
              ) : null}
              <span className="text-xs text-cream/40">
                {formatDate(review.createdAt)}
              </span>
              {review.isHidden ? (
                <span className="rounded-full bg-osc-red/15 px-2 py-0.5 text-[10px] font-bold text-osc-red">
                  hidden by mods — only you can see this
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-3">
                {own ? (
                  <form
                    action={async () => {
                      "use server";
                      await deleteOwnReview(review.id);
                    }}
                  >
                    <ConfirmButton confirmLabel="Delete?">Delete</ConfirmButton>
                  </form>
                ) : (
                  <ReportButton
                    targetType="review"
                    targetId={review.id}
                    signedIn={Boolean(viewerId)}
                  />
                )}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-cream/85">
              {review.text}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
