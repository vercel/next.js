import { getStats } from "@/features/dashboard/dashboard-queries";

export async function StatsCards() {
  const stats = await getStats();

  return (
    <dl className="mt-8 grid grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-foreground/10 p-4"
        >
          <dt className="text-xs text-foreground/50">{stat.label}</dt>
          <dd className="mt-1 truncate text-xl font-semibold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatsCardsSkeleton() {
  return (
    <div aria-hidden className="mt-8 grid grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-foreground/10 p-4">
          <div className="flex h-4 items-center">
            <div className="h-3 w-16 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-1 flex h-7 items-center">
            <div className="h-5 w-12 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
