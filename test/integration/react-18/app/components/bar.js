import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useCachedPromise } from './promise-cache'

const Foo = dynamic(() => import('./foo'), {
  suspense: true,
})

export default function Bar() {
  useCachedPromise(
    'bar',
    () => new Promise((resolve) => setTimeout(resolve, 300)),
    true
  )

  return (
    <div>
      bar
      <Suspense fallback={'oof'}>
        <Foo />
      </Suspense>
    </div>
  )
}
