'use client'

import { TabNavItem } from '../TabNavItem'
import { useSelectedLayoutSegments } from 'next/navigation'

const SubCategoryNav = ({ category }) => {
  const selectedLayoutSegment = useSelectedLayoutSegments()

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
