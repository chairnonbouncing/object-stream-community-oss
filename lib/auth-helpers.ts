import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = { id: string; username: string; isAdmin: boolean };

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { id, username } = session.user;
  const byId = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, isAdmin: true },
  });
  if (byId) return byId;

  // Browser cookies can outlive a local restore/reseed. If the username still
  // exists, use the current row so mutations do not write stale foreign keys.
  if (username) {
    return prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, username: true, isAdmin: true },
    });
  }
  return null;
}

/** Redirects to /signin (with a return path) when not signed in. */
export async function requireUser(callbackPath = "/"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(callbackPath)}`);
  return user;
}

/** 404s for non-admins so /admin stays invisible. Pages only — see getAdminUser for actions. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user?.isAdmin) notFound();
  return user;
}

/** Action-safe admin check: server actions return an error result instead of rendering a 404. */
export async function getAdminUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user?.isAdmin ? user : null;
}
