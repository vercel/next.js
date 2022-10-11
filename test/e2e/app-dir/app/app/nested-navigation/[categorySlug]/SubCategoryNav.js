'use client'

import { TabNavItem } from '../TabNavItem'
import { useSelectedLayoutSegment } from 'next/dist/client/components/hooks-client'

const SubCategoryNav = ({ category }) => {
  const selectedLayoutSegment = useSelectedLayoutSegment()

  return (
    <div style={{ display: 'flex' }}>
      <TabNavItem
        href={`/nested-navigation/${category.slug}`}
        isActive={!selectedLayoutSegment}
      >
        All
      </TabNavItem>

      {category.items.map((item) => (
        <TabNavItem
          key={item.slug}
          href={`/nested-navigation/${category.slug}/${item.slug}`}
          isActive={item.slug === selectedLayoutSegment}
        >
          {item.name}
        </TabNavItem>
      ))}
    </div>
  )
}

export default SubCategoryNav
