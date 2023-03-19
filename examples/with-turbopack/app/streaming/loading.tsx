import { SkeletonCard } from '@/ui/SkeletonCard';
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-6">
        <SkeletonCard isLoading={true} />
        <SkeletonCard isLoading={true} />
        <SkeletonCard isLoading={true} />
        <SkeletonCard isLoading={true} />
        <SkeletonCard isLoading={true} />
        <SkeletonCard isLoading={true} />
      </div>
    </div>
  );
}
