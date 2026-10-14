/* eslint-env jest */
import { createClientRouterFilter } from 'next/dist/lib/create-client-router-filter'
import { BloomFilter } from 'next/dist/shared/lib/bloom-filter'
import type { Route } from 'next/dist/shared/lib/route-types'

describe('createClientRouterFilter', () => {
  it('creates a filter that does not collide with wildly different path names', () => {
    const { staticFilter, dynamicFilter } = createClientRouterFilter(
      ['/_not-found', '/a/[lang]/corporate', '/a/[lang]/gift'] as Route[], // Routes are based on BOTM's app router migration project.
      []
    )

    const staticFilterInstance = new BloomFilter(
      staticFilter.numItems,
      staticFilter.errorRate
    )
    staticFilterInstance.import(staticFilter)
    const dynamicFilterInstance = new BloomFilter(
      dynamicFilter.numItems,
      dynamicFilter.errorRate
    )
    dynamicFilterInstance.import(dynamicFilter)

    expect(
      staticFilterInstance.contains(
        '/all-hardcovers/no-one-can-know-1511?category=current-features'
      )
    ).toBe(false)
  })
})
