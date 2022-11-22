'use client'

export default function Page({ params, searchParams }) {
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
