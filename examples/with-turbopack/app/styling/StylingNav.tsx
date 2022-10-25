'use client';

import { TabNavItem } from '@/ui/TabNavItem';
import { useSelectedLayoutSegments } from 'next/navigation';

const items = [
  {
    name: 'Home',
    slug: '',
  },
  {
    name: 'Global CSS',
    slug: 'global-css',
  },
  {
    name: 'CSS Modules',
    slug: 'css-modules',
  },
  {
    name: 'Styled Components',
    slug: 'styled-components',
  },
  {
    name: 'Styled JSX',
    slug: 'styled-jsx',
  },
  {
    name: 'Tailwind CSS',
    slug: 'tailwind',
  },
];

const StylingNav = () => {
  const [selectedLayoutSegments] = useSelectedLayoutSegments();

  return (
    <div className="flex items-center space-x-4">
      {items.map((item) => (
        <TabNavItem
          key={item.slug}
          href={`/styling/${item.slug}`}
          isActive={item.slug === selectedLayoutSegments}
        >
          {item.name}
        </TabNavItem>
      ))}
    </div>
  );
};

export default StylingNav;
