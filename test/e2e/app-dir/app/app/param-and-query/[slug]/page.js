'use client'

import { use } from 'react'

export default function Page(props) {
  const searchParams = use(props.searchParams)
  const params = use(props.params)
  return (
    <h1
      id="params-and-query"
      data-params={params.slug}
      data-query={searchParams.slug}
    >
      hello from /param-and-query/{params.slug}?slug={searchParams.slug}
    </h1>
  )
}
