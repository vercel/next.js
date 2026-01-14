import { Suspense } from 'react'

export default function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  return (
    <main>
      <Suspense fallback={<div id="home-loading">Loading...</div>}>
        <HomeContent params={params} />
      </Suspense>
    </main>
  )
}

async function HomeContent({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  return (
    <div id="home-content">
      <h1>Home</h1>
      <p>Welcome.</p>
    </div>
  )
}
