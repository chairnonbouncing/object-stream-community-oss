"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fieldErrorsFrom, signinSchema, signupSchema } from "@/lib/validation";
import { clientIp, rateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import type { FormState } from "@/lib/types";

export async function signup(prev: FormState, formData: FormData): Promise<FormState> {
  if (!rateLimit(`signup:${await clientIp()}`, 5, 60 * 60_000)) {
    return { error: RATE_LIMIT_MESSAGE };
  }
  const parsed = signupSchema.safeParse({
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { username, email, password } = parsed.data;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true },
  });
  if (existing) {
    return {
      error:
        existing.username === username
          ? "That username is taken"
          : "That email is already in use",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { username, email, passwordHash } });

  try {
    await signIn("credentials", { username, password, redirectTo: "/" });
  } catch (e) {
    // Success surfaces as a framework redirect (rethrown below); only a real
    // auth failure lands here.
    if (e instanceof AuthError) return { error: "Account created — please sign in." };
    throw e;
  }
  return undefined;
}

export type LoginState =
  | (NonNullable<FormState> & { needsReset?: boolean; username?: string })
  | undefined;

export async function login(prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = signinSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your username and password" };

  // Brute-force guard: per-IP for spray attempts, per-username so a
  // distributed attack on one account still slows down.
  const ip = await clientIp();
  if (
    !rateLimit(`login:ip:${ip}`, 15, 10 * 60_000) ||
    !rateLimit(`login:user:${parsed.data.username.toLowerCase()}`, 15, 10 * 60_000)
  ) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  // Accounts restored from a backup have no usable password — route them to
  // the one-time self-service reset instead of a dead-end "wrong password".
  const account = await prisma.user.findUnique({
    where: { username: parsed.data.username },
    select: { mustResetPassword: true },
  });
  if (account?.mustResetPassword) {
    return { needsReset: true, username: parsed.data.username };
  }

  const raw = formData.get("callbackUrl");
  const callbackUrl =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: callbackUrl });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Invalid username or password" };
    throw e;
  }
  return undefined;
}

/**
 * One-time reclaim for backup-restored accounts: sets a brand-new password
 * and signs the user in. Only works while mustResetPassword is set — the flag
 * clears on use, so an account can never be reclaimed twice.
 */
export async function reclaimAccount(
  prev: FormState,
  formData: FormData
): Promise<FormState> {
  const usernameRaw = formData.get("username");
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  const username = typeof usernameRaw === "string" ? usernameRaw.trim().toLowerCase() : "";

  if (!rateLimit(`reclaim:${await clientIp()}`, 5, 15 * 60_000)) {
    return { error: RATE_LIMIT_MESSAGE };
  }

  if (typeof password !== "string" || password.length < 8) {
    return { fieldErrors: { password: ["At least 8 characters"] } };
  }
  if (password !== confirm) {
    return { fieldErrors: { confirm: ["Passwords don't match"] } };
  }

  // updateMany + flag filter = atomic single-use guard (no reclaim race).
  const claimed = await prisma.user.updateMany({
    where: { username, mustResetPassword: true },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      mustResetPassword: false,
    },
  });
  if (claimed.count === 0) {
    return { error: "This account doesn't need a password reset" };
  }

  try {
    await signIn("credentials", { username, password, redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) return { error: "Password saved — please sign in." };
    throw e;
  }
  return undefined;
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
