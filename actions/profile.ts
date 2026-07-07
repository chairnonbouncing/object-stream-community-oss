"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-helpers";
import { fieldErrorsFrom, profileSchema } from "@/lib/validation";
import type { FormState } from "@/lib/types";

export async function changePassword(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in first" };

  const current = formData.get("current");
  const next = formData.get("next");
  const confirm = formData.get("confirm");
  if (typeof current !== "string" || typeof next !== "string" || next.length < 8) {
    return { fieldErrors: { next: ["New password needs at least 8 characters"] } };
  }
  if (next !== confirm) {
    return { fieldErrors: { confirm: ["Passwords don't match"] } };
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!row || !(await bcrypt.compare(current, row.passwordHash))) {
    return { fieldErrors: { current: ["Current password is wrong"] } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return undefined;
}

export async function updateProfile(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in first" };

  const parsed = profileSchema.safeParse({
    avatarUrl: formData.get("avatarUrl"),
    bio: formData.get("bio"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarUrl: parsed.data.avatarUrl ?? null,
      bio: parsed.data.bio ?? null,
    },
  });

  revalidatePath(`/profile/${user.username}`);
  redirect(`/profile/${user.username}`);
}
