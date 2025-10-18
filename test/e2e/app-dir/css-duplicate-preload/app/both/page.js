'use client'

import dynamicImport from 'next/dynamic'
import '../../components/dynamic-styles.css'

const DynamicComponent = dynamicImport(
  () => import('../../components/dynamic-with-css')
)

export default function Page() {
  return (
    <div>
      <h1>Page with Static and Dynamic CSS</h1>
      <div className="dynamic-text">Static usage of shared CSS</div>
      <DynamicComponent />
    </div>
  )
}

export const dynamic = 'force-dynamic'
