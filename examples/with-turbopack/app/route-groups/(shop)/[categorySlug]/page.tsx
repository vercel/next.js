import { use } from 'react';
import { fetchCategoryBySlug, PageProps } from '@/lib/getCategories';
import { SkeletonCard } from '@/ui/SkeletonCard';

export default function Page({ params }: PageProps) {
  const category = use(fetchCategoryBySlug(params.categorySlug));
  if (!category) return null;
  return (
    <div className="space-y-4">
      <div className="text-xl font-medium text-zinc-500">
        All {category.name}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
