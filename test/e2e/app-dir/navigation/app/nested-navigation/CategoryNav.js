'use client'

import { TabNavItem } from './TabNavItem'
import { useSelectedLayoutSegments } from 'next/navigation'

const CategoryNav = ({ categories }) => {
  const selectedLayoutSegment = useSelectedLayoutSegments()

  return (
    <div style={{ display: 'flex' }}>
      <TabNavItem href="/nested-navigation" isActive={!selectedLayoutSegment}>
        Home
      </TabNavItem>

      {categories.map((item) => (
        <TabNavItem
          key={item.slug}
          href={`/nested-navigation/${item.slug}`}
          isActive={item.slug === selectedLayoutSegment}
          prefetch={item.prefetch}
        >
          {item.name}
        </TabNavItem>
      ))}
    </div>
  )
}

export default CategoryNav
