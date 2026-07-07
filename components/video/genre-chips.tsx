import Link from "next/link";
import { Badge, tagColor } from "@/components/ui/badge";
import { splitTags } from "@/lib/format";

export function GenreChips({
  genreTags,
  limit,
  linked = true,
}: {
  genreTags: string;
  limit?: number;
  linked?: boolean;
}) {
  const tags = splitTags(genreTags).slice(0, limit);
  if (tags.length === 0) return null;

  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((tag) =>
        linked ? (
          <Link key={tag} href={`/discover?genre=${encodeURIComponent(tag)}`}>
            <Badge color={tagColor(tag)} className="hover:brightness-125">
              {tag}
            </Badge>
          </Link>
        ) : (
          <Badge key={tag} color={tagColor(tag)}>
            {tag}
          </Badge>
        )
      )}
    </span>
  );
}
