export function DiscussionCardSkeleton() {
  return (
    <div className="p-6 border border-border rounded-lg bg-card">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-6 w-16 bg-muted animate-pulse rounded" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        </div>
      </div>
    </div>
  )
}
