import { Suspense, use } from 'react'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

type SearchParams = { foo: string | string[] | undefined }
export default async function Page(props: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <>
      <p>
        This page accesses Math.random() while prerendering but it does so late
        enough in the render that all unfinished sub-trees have a defined
        Suspense boundary. This is fine and doesn't need to error the build.
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <RandomReadingComponent />
        </IndirectionOne>
      </Suspense>
      <Suspense fallback={<Fallback />}>
        <IndirectionTwo>
          <LongRunningComponent />
        </IndirectionTwo>
      </Suspense>
      <IndirectionThree>
        <ShortRunningComponent />
      </IndirectionThree>
    </>
  )
}

function RandomReadingComponent() {
  if (typeof window === 'undefined') {
    use(new Promise((r) => process.nextTick(r)))
  }
  const random = Math.random()
  return (
    <div>
      <span id="rand">{random}</span>
    </div>
  )
}

function LongRunningComponent() {
  if (typeof window === 'undefined') {
    use(
      new Promise((r) =>
        process.nextTick(async () => {
          await 1
          process.nextTick(r)
        })
      )
    )
  }
  return (
    <div>
      this component took a long time to resolve (but still before the dynamicIO
      cutoff). It might not be done before the Math.random() access happens.
    </div>
  )
}

function ShortRunningComponent() {
  return (
    <div>
      This component runs quickly (in a microtask). It should be finished before
      the Math.random() access happens.
    </div>
  )
}

function Fallback() {
  return <div data-fallback="">loading...</div>
}
