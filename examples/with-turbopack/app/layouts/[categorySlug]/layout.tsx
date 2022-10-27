import { use } from 'react';
import { fetchCategoryBySlug, type PageProps } from '@/lib/getCategories';
import ClickCounter from '@/ui/ClickCounter';
import SubCategoryNav from './SubCategoryNav';

export default function Layout({
  children,
  // category,
  params,
}: PageProps) {
  const category = use(fetchCategoryBySlug(params.categorySlug));
  if (!category) return null;
  return (
    <div className="space-y-9">
      <div>
        <div className="flex items-center justify-between">
          <SubCategoryNav category={category} />
          <div>
            <ClickCounter />
          </div>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
