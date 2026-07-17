import { getRecentActivity } from "@/features/dashboard/dashboard-queries";

export async function RecentActivity() {
  const activity = await getRecentActivity();

  return (
    <ul className="mt-4 flex flex-col divide-y divide-foreground/10 rounded-lg border border-foreground/10">
      {activity.map((item) => (
        <li
          key={item.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <span className="text-sm">{item.description}</span>
          <span className="text-xs text-foreground/50">{item.at}</span>
        </li>
      ))}
    </ul>
  );
}

export function RecentActivitySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-hidden
      className="mt-4 flex flex-col divide-y divide-foreground/10 rounded-lg border border-foreground/10"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3">
          <div className="flex h-5 items-center">
            <div className="h-3.5 w-48 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="flex h-5 items-center">
            <div className="h-3 w-12 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
