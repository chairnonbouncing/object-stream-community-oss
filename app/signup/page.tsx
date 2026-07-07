import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Join" };

export default async function SignUpPage() {
  const user = await getSessionUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto mt-8 max-w-md">
      <h1 className="font-display text-3xl text-cream">Join the community!</h1>
      <p className="mt-1 text-sm text-cream/60">
        Free forever. Submit episodes, build playlists, rate your favorites.
      </p>
      <div className="mt-6 rounded-3xl border border-line bg-surface p-6">
        <SignUpForm />
      </div>
      <p className="mt-4 text-center text-sm text-cream/60">
        Already have an account?{" "}
        <Link href="/signin" className="font-bold text-osc-blue hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
