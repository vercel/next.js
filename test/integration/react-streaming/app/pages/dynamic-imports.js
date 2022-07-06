import { lazy, Suspense } from 'react'
import dynamic from 'next/dynamic'

const Foo = lazy(() => import('../components/foo.client'))
const Bar = dynamic(() => import('../components/bar.client'), {
  suspense: true,
})

export default function Page() {
  return (
    <div>
      <Suspense fallback="fallback">
        <Foo />
        <Bar />
      </Suspense>
    </div>
  )
}
