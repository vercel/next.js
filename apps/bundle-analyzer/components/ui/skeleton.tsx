import { cn } from '@/lib/utils'

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export function TreemapSkeleton() {
  return (
    <div className="h-full w-full grid grid-cols-12 grid-rows-8 gap-2">
      {/* Simulate treemap blocks with varying sizes */}
      <Skeleton className="col-span-5 row-span-4" />
      <Skeleton className="col-span-4 row-span-3" />
      <Skeleton className="col-span-3 row-span-3" />
      <Skeleton className="col-span-4 row-span-1" />
      <Skeleton className="col-span-3 row-span-2" />
      <Skeleton className="col-span-3 row-span-4" />
      <Skeleton className="col-span-2 row-span-2" />
      <Skeleton className="col-span-2 row-span-2" />
      <Skeleton className="col-span-3 row-span-2" />
      <Skeleton className="col-span-4 row-span-2" />
      <Skeleton className="col-span-2 row-span-2" />
      <Skeleton className="col-span-3 row-span-2" />
    </div>
  )
}

export function TableSkeleton() {
  return (
    <div className="flex h-full w-full flex-col p-4" aria-hidden="true">
      <div className="flex h-9 flex-none items-center gap-4 border-b border-border px-3">
        <div className="flex h-full w-full items-center gap-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      {Array.from({ length: 32 }, (_, index) => (
        <div
          key={index}
          className="flex h-9 flex-none items-center gap-4 border-b border-border/60 px-3"
        >
          <Skeleton
            className="h-3"
            style={{ width: `${35 + (index % 5) * 8}%` }}
          />
          <Skeleton className="ml-auto h-3 w-20" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

export function AnalyzerChromeSkeleton({
  view,
}: {
  view: 'table' | 'treemap'
}) {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="flex h-14 flex-none items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-9 min-w-64 flex-1" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex h-[113px] flex-none border-b border-border">
        <div className="flex min-w-0 flex-1 flex-col gap-2 border-r border-border px-4 py-3">
          <Skeleton className="h-3 w-16" />
          <div className="flex min-h-0 flex-1 gap-2">
            <Skeleton className="h-full flex-1" />
            <Skeleton className="h-full flex-1" />
            <Skeleton className="h-full flex-1" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 bg-muted/30 px-4 py-3">
          <Skeleton className="h-3 w-12" />
          <div className="flex min-h-0 flex-1 gap-2">
            <Skeleton className="h-full flex-1" />
            <Skeleton className="h-full flex-1" />
            <Skeleton className="h-full flex-1" />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-4">
          {view === 'table' ? <TableSkeleton /> : <TreemapSkeleton />}
        </div>
        <div className="w-px flex-none bg-border" />
        <aside className="flex w-1/5 flex-none flex-col gap-5 border-l border-border bg-muted p-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-4/5" />
        </aside>
      </div>
    </main>
  )
}
