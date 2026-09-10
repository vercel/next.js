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
      <div className="flex h-9 items-center gap-4 border-b border-border px-3">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-24" />
      </div>
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className="flex min-h-0 flex-1 items-center gap-4 border-b border-border/60 px-3"
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
