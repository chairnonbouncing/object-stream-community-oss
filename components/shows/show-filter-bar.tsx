"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AGE_RANGE_TAGS, SHOW_STATUSES } from "@/lib/constants";
import { Input, Select } from "@/components/ui/field";

const SORTS = [
  { value: "episodes", label: "Most episodes" },
  { value: "recent", label: "Recently added" },
  { value: "rating", label: "Highest rated" },
  { value: "views", label: "Most viewed" },
  { value: "followers", label: "Most followed" },
] as const;

export function ShowFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/shows?${qs}` : "/shows");
  }

  const hasFilters = ["q", "status", "age", "sort"].some((key) =>
    searchParams.get(key)
  );
  const selectClasses = "w-auto min-w-32 py-2 text-xs";

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
          placeholder="Search shows..."
          aria-label="Search shows"
          className="py-2 text-xs"
        />
      </form>

      <Select
        aria-label="Status"
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className={selectClasses}
      >
        <option value="">Any status</option>
        {SHOW_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
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
        aria-label="Sort"
        value={searchParams.get("sort") ?? "episodes"}
        onChange={(e) => setParam("sort", e.target.value === "episodes" ? "" : e.target.value)}
        className={selectClasses}
      >
        {SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </Select>

      {hasFilters ? (
        <button
          onClick={() => router.replace("/shows")}
          className="rounded-full px-3 py-1.5 text-xs font-bold text-osc-red hover:bg-osc-red/10"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
