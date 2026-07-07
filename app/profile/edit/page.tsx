import type { Metadata } from "next";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm, EditProfileForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit Profile" };

export default async function EditProfilePage() {
  const sessionUser = await requireUser("/profile/edit");
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { username: true, avatarUrl: true, bio: true },
  });

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl text-cream">Edit profile</h1>
      <p className="mt-1 text-sm text-cream/60">@{user?.username}</p>
      <div className="mt-6 rounded-3xl border border-line bg-surface p-6">
        <EditProfileForm avatarUrl={user?.avatarUrl ?? ""} bio={user?.bio ?? ""} />
      </div>
      <h2 className="mt-8 font-display text-xl text-cream">Password</h2>
      <div className="mt-3 rounded-3xl border border-line bg-surface p-6">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
