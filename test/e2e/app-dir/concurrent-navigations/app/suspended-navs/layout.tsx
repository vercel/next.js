import { Suspense } from 'react'
import { DynamicRenderCounter } from '../../components/dynamic-render-counter'

export default function Page({ children }: LayoutProps<'/suspended-navs'>) {
  return (
    <div>
      <Suspense fallback="Loading...">
        <div id="dynamic-render-counter">
          Layout renders: <DynamicRenderCounter />
        </div>
      </Suspense>
      {children}
    </div>
  )
}
