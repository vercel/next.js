'use client'

import dynamicImport from 'next/dynamic'

const DynamicComponent = dynamicImport(
  () => import('../../components/dynamic-with-css')
)

export default function Page() {
  return (
    <div>
      <h1>Test Page with Dynamic CSS</h1>
      <DynamicComponent />
    </div>
  )
}

export const dynamic = 'force-dynamic'
