import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** "Random page" — a classic wiki rabbit-hole button. */
export async function GET() {
  const count = await prisma.wikiPage.count({ where: { isHidden: false } });
  if (count === 0) redirect("/wiki");
  const page = await prisma.wikiPage.findFirst({
    where: { isHidden: false },
    skip: Math.floor(Math.random() * count),
    select: { slug: true },
  });
  redirect(page ? `/wiki/${page.slug}` : "/wiki");
}
