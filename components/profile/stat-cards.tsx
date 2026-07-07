export function StatCards({
  stats,
}: {
  stats: {
    playlistsCreated: number;
    reviewsPosted: number;
    showsSubmitted: number;
  };
}) {
  const items = [
    { label: "Playlists", value: stats.playlistsCreated, color: "text-osc-blue" },
    { label: "Reviews", value: stats.reviewsPosted, color: "text-osc-star" },
    { label: "Shows submitted", value: stats.showsSubmitted, color: "text-[#b795ff]" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-line bg-surface px-4 py-3 text-center"
        >
          <p className={`font-display text-2xl ${item.color}`}>{item.value}</p>
          <p className="text-xs font-bold text-cream/50">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
