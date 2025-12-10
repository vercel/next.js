import { Suspense } from 'react'
import { DynamicRenderCounter } from '../../../components/dynamic-render-counter'

export default function Page() {
  return (
    <>
      <div id="target-page-content">Target page</div>
      <Suspense fallback="Loading...">
        <p id="target-page-render-counter">
          Target page renders: <DynamicRenderCounter />
        </p>
      </Suspense>
    </>
  )
}
