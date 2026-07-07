"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/field";

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "saves", label: "Most saved" },
  { value: "views", label: "Most viewed" },
  { value: "runtime", label: "Longest runtime" },
  { value: "videos", label: "Most videos" },
] as const;

export function PlaylistFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/playlists?${qs}` : "/playlists");
  }

  const hasFilters = ["q", "sort"].some((key) => searchParams.get(key));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          setParam("q", typeof q === "string" ? q.trim() : "");
        }}
        className="w-full sm:w-72"
      >
        <Input
          name="q"
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          key={searchParams.get("q") ?? ""}
          placeholder="Search playlists..."
          aria-label="Search playlists"
          className="py-2 text-xs"
        />
      </form>

      <Select
        aria-label="Sort"
        value={searchParams.get("sort") ?? "updated"}
        onChange={(e) => setParam("sort", e.target.value === "updated" ? "" : e.target.value)}
        className="w-auto min-w-36 py-2 text-xs"
      >
        {SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </Select>

      {hasFilters ? (
        <button
          onClick={() => router.replace("/playlists")}
          className="rounded-full px-3 py-1.5 text-xs font-bold text-osc-red hover:bg-osc-red/10"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
