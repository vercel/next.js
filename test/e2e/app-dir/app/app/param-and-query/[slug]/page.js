'use client'

export default async function Page({ params, searchParams }) {
  return (
    <h1
      id="params-and-query"
      data-params={params.slug}
      data-query={(await searchParams).slug}
    >
      hello from /param-and-query/{params.slug}?slug={(await searchParams).slug}
    </h1>
  )
}
