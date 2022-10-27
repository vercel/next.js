'use client';

import { type Category } from '@/lib/getCategories';
import { TabNavItem } from '@/ui/TabNavItem';
import { useSelectedLayoutSegments } from 'next/navigation';

const CategoryNav = ({ categories }: { categories: Category[] }) => {
  // TODO: check useSelectedLayoutSegments
  const [selectedLayoutSegments] = useSelectedLayoutSegments();

  return (
    <div className="flex items-center space-x-4">
      <TabNavItem href="/context" isActive={!selectedLayoutSegments}>
        Home
      </TabNavItem>

      {categories.map((item) => (
        <TabNavItem
          key={item.slug}
          href={`/context/${item.slug}`}
          isActive={item.slug === selectedLayoutSegments}
        >
          {item.name}
        </TabNavItem>
      ))}
    </div>
  );
};
export default CategoryNav;
