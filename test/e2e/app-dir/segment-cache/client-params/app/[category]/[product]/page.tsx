'use client'

import { Suspense, use } from 'react'

function Content({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { product } = use(params)
  const searchParamsDict = use(searchParams)

  let query = null
  if (Object.keys(searchParamsDict).length > 0) {
    query = JSON.stringify(searchParamsDict)
  }

  return (
    <>
      <p id="product">Product: {product}</p>
      <p id="query">Query: {query ? query : '(none)'}</p>
    </>
  )
}

export default function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ product: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <Suspense fallback="Loading...">
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  )
}
