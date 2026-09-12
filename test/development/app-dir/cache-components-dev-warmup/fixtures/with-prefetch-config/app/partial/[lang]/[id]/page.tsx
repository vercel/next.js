import { Suspense } from 'react'
import { CachedData } from '../../../data-fetching'

const CACHE_KEY = __dirname + '/__PAGE__'

export default function PartialIdPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p>Waiting for id...</p>}>
        <IdLabel params={params} />
      </Suspense>
    </main>
  )
}

async function IdLabel({
  params,
}: {
  params: Promise<{ lang: string; id: string }>
}) {
  const { id } = await params
  console.log('after params - id')
  return (
    <>
      <p>id: {id}</p>
      <CachedData label="page" cacheKey={`${CACHE_KEY}-${id}`} />
    </>
  )
}
