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
