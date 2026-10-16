'use client'

import dynamicApi from 'next/dynamic'

const AsyncNestedOuter = dynamicApi(
  () => import('../../../components/nested-outer')
)

export default function Page() {
  return <AsyncNestedOuter />
}

export const dynamic = 'force-dynamic'
