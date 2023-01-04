import { fetchCategoryBySlug, PageProps } from '@/lib/getCategories';
import { Boundary } from '@/ui/Boundary';
import { use } from 'react';
import { Counter } from '../ClickCounter';
import SubCategoryNav from '../SubCategoryNav';

export default function Layout({ children, params }: PageProps) {
  const category = use(fetchCategoryBySlug(params.categorySlug));
  if (!category) return null;

  return (
    <Boundary labels={['Layout [Server Component]']} animateRerendering={false}>
      <div className="space-y-9">
        <SubCategoryNav category={category} />
        <Counter />
        <div>{children}</div>
      </div>
    </Boundary>
  );
}
