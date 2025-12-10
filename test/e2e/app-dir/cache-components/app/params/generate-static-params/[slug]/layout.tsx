import { Suspense } from 'react'

export async function generateStaticParams() {
  const set = new Set()
  set.add(await fetchRandom('a'))
  set.add(await fetchRandom('a'))

  return Array.from(set).map((value) => {
    return {
      slug: ('' + value).slice(2),
    }
  })
}

export default async function Layout({ children, params }) {
  return (
    <Suspense fallback="loading">
      <Inner params={params}>{children}</Inner>
    </Suspense>
  )
}

async function Inner({ children, params }) {
  return (
    <>
      <h1>{(await params).slug}</h1>
      <section>{children}</section>
    </>
  )
}

const fetchRandom = async (entropy: string) => {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy
  )
  return response.text()
}
