import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ShowWikiShortcutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const show = await prisma.show.findUnique({
    where: { slug },
    select: { wikiPages: { where: { pageType: { in: ["Show", "Upcoming Show"] } }, select: { slug: true }, take: 1 } },
  });
  const pageSlug = show?.wikiPages[0]?.slug;
  if (!pageSlug) notFound();
  redirect(`/wiki/${pageSlug}`);
}
