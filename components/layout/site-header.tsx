import Link from "next/link";
import { auth } from "@/auth";
import { NavLinks } from "@/components/layout/nav-links";
import { UserMenu } from "@/components/layout/user-menu";
import { ButtonLink } from "@/components/ui/button";

function SearchForm({ className }: { className?: string }) {
  return (
    <form action="/discover" className={className} role="search">
      <input
        type="search"
        name="q"
        placeholder="Search shows, episodes, tags…"
        className="w-full rounded-full border border-line bg-surface px-4 py-2 text-sm text-cream placeholder:text-cream/35 focus:border-osc-purple focus:outline-none focus:ring-2 focus:ring-osc-purple/40"
        aria-label="Search the catalog"
      />
    </form>
  );
}

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;

  return (
    <header className="sticky top-0 z-40 bg-night/85 shadow-lg shadow-black/20 backdrop-blur">
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-osc-green/50 via-osc-purple/60 to-osc-blue/50"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-center gap-3 py-3">
          <Link
            href="/"
            className="shrink-0 rounded-xl bg-white p-1 shadow-md shadow-osc-purple/20"
            aria-label="Object Stream Community — home"
          >
            <img
              src="/images/logobig.jpeg"
              alt="Object Stream Community"
              className="h-9 w-auto rounded-lg"
            />
          </Link>

          <div className="hidden min-w-0 lg:block">
            <NavLinks />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SearchForm className="hidden w-56 md:block" />
            {user ? (
              <UserMenu
                username={user.username}
                isAdmin={user.isAdmin}
                avatarUrl={user.image ?? null}
              />
            ) : (
              <>
                <ButtonLink href="/signup" variant="ghost" size="sm" className="hidden sm:inline-flex">
                  Join
                </ButtonLink>
                <ButtonLink href="/signin" variant="outline" size="sm">
                  Sign In
                </ButtonLink>
              </>
            )}
          </div>
        </div>

        <div className="hide-scrollbar -mx-4 overflow-x-auto px-4 pb-3 lg:hidden">
          <NavLinks />
        </div>
        <div className="pb-3 md:hidden">
          <SearchForm />
        </div>
      </div>
    </header>
  );
}
