import { lazy, Suspense } from 'react'
import dynamic from 'next/dynamic'

const Foo = lazy(() => import('../components/foo'))
const Bar = dynamic(() => import('../components/bar'), {
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
