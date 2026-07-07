import type { Metadata } from "next";
import { requireUser } from "@/lib/auth-helpers";
import { SubmitForm } from "@/components/submit/submit-form";

export const metadata: Metadata = { title: "Submit a Video" };

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  await requireUser("/submit");
  const { url } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl text-cream sm:text-4xl">Submit a video</h1>
      <p className="mt-2 text-sm text-cream/60">
        Paste a YouTube or Vimeo link. The video always plays through the official
        player, so the creator keeps every view. No reuploads, no file uploads —
        ever.
      </p>
      <div className="mt-6 rounded-3xl border border-line bg-surface p-6">
        <SubmitForm initialUrl={url} />
      </div>
    </div>
  );
}
