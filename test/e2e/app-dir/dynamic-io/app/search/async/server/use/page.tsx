import { getSentinelValue } from '../../../../getSentinelValue'

import { Suspense, use } from 'react'

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  return (
    <>
      <p>
        This page `use`'s the searchParams promise before accessing a property
        on it.
      </p>
      <p>With PPR we expect the page to have an empty shell</p>
      <p>Without PPR we expect the page to be dynamic</p>
      <Suspense fallback="outer loading...">
        <Suspense fallback="inner loading...">
          <Component searchParams={searchParams} />
        </Suspense>
        <ComponentTwo />
      </Suspense>
    </>
  )
}

function Component({
  searchParams,
}: {
  searchParams: Promise<AnySearchParams>
}) {
  const params = use(searchParams)
  return (
    <>
      <div>
        This component accessed `searchParams.sentinel`: "
        <span id="value">{params.sentinel}</span>"
      </div>
      <span id="page">{getSentinelValue()}</span>
    </>
  )
}

function ComponentTwo() {
  return null
}
