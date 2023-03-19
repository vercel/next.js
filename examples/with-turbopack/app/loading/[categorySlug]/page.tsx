// @ts-ignore
import { use } from 'react';
import {
  fetchCategoryBySlug,
  PageProps,
  type Category,
} from '@/lib/getCategories';
import { SkeletonCard } from '@/ui/SkeletonCard';

const fetchCategory = async (
  categorySlug: string | undefined,
): Promise<Category | undefined> => {
  // artificial delay
  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (!categorySlug) return;

  return await fetchCategoryBySlug(categorySlug);
};

export default function Page({ params }: PageProps) {
  const category = use(fetchCategory(params.categorySlug));
  if (!category) return null;

  return (
    <div className="space-y-4">
      <div className="text-xl font-medium text-zinc-500">{category.name}</div>

      <div className="grid grid-cols-3 gap-6">
        {Array.from({ length: category.count }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
