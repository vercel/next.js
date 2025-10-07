import { Suspense, use } from 'react'

import { IndirectionOne, IndirectionTwo, IndirectionThree } from './indirection'

type SearchParams = { foo: string | string[] | undefined }
export default async function Page(props: {
  searchParams: Promise<SearchParams>
}) {
  return (
    <>
      <p>
        This page accesses Math.random() while prerendering and does so before
        something that is not wrapped in a Suspense boundary has finished
        rendering
      </p>
      <Suspense fallback={<Fallback />}>
        <IndirectionOne>
          <RandomReadingComponent />
        </IndirectionOne>
      </Suspense>
      <IndirectionTwo>
        <LongRunningComponent />
      </IndirectionTwo>
      <IndirectionThree>
        <ShortRunningComponent />
      </IndirectionThree>
    </>
  )
}

function getRandomNumber() {
  return Math.random()
}

function RandomReadingComponent() {
  if (typeof window === 'undefined') {
    use(new Promise((r) => process.nextTick(r)))
  }

  const random = getRandomNumber()

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
      this component took a long time to resolve (but still before the
      cacheComponents cutoff). It might not be done before the Math.random()
      access happens.
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
