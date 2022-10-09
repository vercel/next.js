'client'

import { TabNavItem } from './TabNavItem'
import { useSelectedLayoutSegment } from 'next/dist/client/components/hooks-client'

const CategoryNav = ({ categories }) => {
  const selectedLayoutSegment = useSelectedLayoutSegment()

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
        >
          {item.name}
        </TabNavItem>
      ))}
    </div>
  )
}

export default CategoryNav
