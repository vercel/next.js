'use client'

import { Suspense, use } from 'react'

import { getSentinelValue } from '../../../getSentinelValue'

type AnySearchParams = { [key: string]: string | string[] | undefined }

export default function Page({
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
      <p>The `use` is inside a Suspense boundary</p>
      <p>With PPR we expect the page to have a partially static page</p>
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
