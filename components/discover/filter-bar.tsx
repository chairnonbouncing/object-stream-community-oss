"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AGE_RANGE_TAGS, GENRES, LANGUAGES, SHOW_STATUSES } from "@/lib/constants";
import { Input, Select } from "@/components/ui/field";

const SORTS = [
  { value: "recent", label: "Recently added" },
  { value: "rating", label: "Highest rated" },
  { value: "views", label: "Most views" },
  { value: "watched", label: "Most marked watched" },
  { value: "runtime", label: "Shortest runtime" },
] as const;

const RUNTIMES = [
  { value: "short", label: "Short (≤10 min)" },
  { value: "standard", label: "10–20 min" },
  { value: "long", label: "Long (20+ min)" },
  { value: "unknown", label: "Runtime unknown" },
] as const;

export function FilterBar({ years }: { years: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page"); // filters reset pagination
    const qs = params.toString();
    router.replace(qs ? `/discover?${qs}` : "/discover");
  }

  const hasFilters = [
    "q",
    "genre",
    "status",
    "year",
    "language",
    "provider",
    "age",
    "runtime",
    "sort",
  ].some((k) => searchParams.get(k));

  const selectClasses = "w-auto min-w-28 py-2 text-xs";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          setParam("q", typeof q === "string" ? q.trim() : "");
        }}
        className="w-full sm:w-64"
      >
        <Input
          name="q"
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          key={searchParams.get("q") ?? ""}
          placeholder="Search titles, descriptions, tags…"
          aria-label="Search"
          className="py-2 text-xs"
        />
      </form>

      <Select
        aria-label="Genre"
        value={searchParams.get("genre") ?? ""}
        onChange={(e) => setParam("genre", e.target.value)}
        className={selectClasses}
      >
        <option value="">All genres</option>
        {GENRES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Status"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any status</option>
        {SHOW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Year"
        value={searchParams.get("year") ?? ""}
        onChange={(e) => setParam("year", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any year</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Language"
        value={searchParams.get("language") ?? ""}
        onChange={(e) => setParam("language", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any language</option>
        {LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Platform"
        value={searchParams.get("provider") ?? ""}
        onChange={(e) => setParam("provider", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any platform</option>
        <option value="youtube">YouTube</option>
        <option value="vimeo">Vimeo</option>
      </Select>

      <Select
        aria-label="Age range"
        value={searchParams.get("age") ?? ""}
        onChange={(e) => setParam("age", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any age</option>
        {AGE_RANGE_TAGS.map((age) => (
          <option key={age} value={age}>
            {age}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Runtime"
        value={searchParams.get("runtime") ?? ""}
        onChange={(e) => setParam("runtime", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any runtime</option>
        {RUNTIMES.map((runtime) => (
          <option key={runtime.value} value={runtime.value}>
            {runtime.label}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Sort"
        value={searchParams.get("sort") ?? "recent"}
        onChange={(e) => setParam("sort", e.target.value === "recent" ? "" : e.target.value)}
        className={selectClasses}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>

      {hasFilters ? (
        <button
          onClick={() => router.replace("/discover")}
          className="rounded-full px-3 py-1.5 text-xs font-bold text-osc-red hover:bg-osc-red/10"
        >
          ✕ Clear
        </button>
      ) : null}
    </div>
  );
}
