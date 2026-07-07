import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");

  const { callbackUrl } = await searchParams;

  return (
    <div className="mx-auto mt-8 max-w-md">
      <h1 className="font-display text-3xl text-cream">Welcome back!</h1>
      <p className="mt-1 text-sm text-cream/60">
        Sign in to track shows, build playlists, and post reviews.
      </p>
      <div className="mt-6 rounded-3xl border border-line bg-surface p-6">
        <SignInForm callbackUrl={callbackUrl} />
      </div>
      <p className="mt-4 text-center text-sm text-cream/60">
        New here?{" "}
        <Link href="/signup" className="font-bold text-osc-blue hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
