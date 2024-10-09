import { Suspense } from 'react'

// TODO once we make fetchCache inert with dynamicIO this test is expected
// to start failing. Right now the force cache causes the fetches to be identical
// and we get only one prebuilt route. once we remove the caching behavior of fetchCache
// when dynamicIO is on we will get more than one route.
// The ideal test wouldn't even use fetchCache but at the moment the default caching for fetch
// is to not cache and so we can't rely on the default to produce a differentiating result.
export const fetchCache = 'default-cache'

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
      <h1>{await params.slug}</h1>
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
